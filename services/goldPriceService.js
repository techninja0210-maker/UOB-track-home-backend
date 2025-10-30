const axios = require('axios');

/**
 * Gold Price Service
 * Fetches real-time gold prices from Metals.dev API
 */

class GoldPriceService {
  constructor() {
    // Try multiple APIs for redundancy
    this.metalsDevUrl = 'https://api.metals.dev/v1/latest';
    this.goldApiUrl = 'https://www.goldapi.io/api/XAU/USD'; // Alternative
    this.apiKey = process.env.METALS_DEV_API_KEY || process.env.GOLD_API_KEY || 'demo';
    
    // Cache to avoid hitting API limits
    this.cache = {
      price: null,
      timestamp: null,
      ttl: parseInt(process.env.GOLD_PRICE_TTL_MS || '60000', 10)
    };
  }

  /**
   * Get current gold price per gram in USD
   */
  async getCurrentGoldPrice(force = false) {
    try {
      // Check cache first unless force refresh
      if (!force && this.isCacheValid()) {
        console.log('📊 Using cached gold price:', this.cache.price);
        return this.cache.price;
      }

      console.log('🔍 Fetching fresh gold price from Metals.dev...');

      // Metals.dev API - API key in URL params
      try {
        const response = await axios.get('https://api.metals.dev/v1/latest', {
          params: {
            api_key: this.apiKey,
            currency: 'USD',
            unit: 'toz' // troy ounce
          },
          headers: {
            'Accept': 'application/json'
          },
          timeout: 10000
        });

        if (response.data && response.data.metals && response.data.metals.gold) {
          // Price is per troy ounce, convert to grams
          // 1 troy ounce = 31.1035 grams
          const pricePerOunce = parseFloat(response.data.metals.gold);
          const pricePerGram = pricePerOunce / 31.1035;
          
          // Update cache
          this.cache = {
            price: parseFloat(pricePerGram.toFixed(2)),
            timestamp: Date.now(),
            ttl: this.cache.ttl
          };

          console.log(`✅ Gold price updated: $${pricePerGram.toFixed(2)}/gram (from $${pricePerOunce}/oz)`);
          return parseFloat(pricePerGram.toFixed(2));
        }

        throw new Error('Invalid API response format');
      } catch (apiError) {
        console.log('⚠️ Metals.dev API failed:', apiError.message);
      }

      // Fallback: Use a reliable approximate price
      throw new Error('API unavailable');

    } catch (error) {
      console.error('❌ Error fetching gold price:', error.message);
      
      // Fallback to cached price if available
      if (this.cache.price) {
        console.log('⚠️ Using stale cached price due to API error');
        return this.cache.price;
      }

      // Ultimate fallback (approximate current gold price)
      const fallbackPrice = 65.50; // ~$65.50/gram (approximate)
      console.log(`⚠️ Using fallback gold price: $${fallbackPrice}/gram`);
      return fallbackPrice;
    }
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    if (!this.cache.price || !this.cache.timestamp) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < this.cache.ttl;
  }

  /**
   * Get gold price with metadata
   */
  async getGoldPriceWithMetadata(force = false) {
    const price = await this.getCurrentGoldPrice(force);
    
    return {
      pricePerGram: price,
      currency: 'USD',
      unit: 'gram',
      timestamp: new Date().toISOString(),
      source: 'Metals.dev',
      cached: this.isCacheValid()
    };
  }

  /**
   * Calculate crypto to gold exchange
   */
  async calculateCryptoToGold(cryptoAmount, cryptoPriceUSD) {
    const goldPricePerGram = await this.getCurrentGoldPrice();
    
    // Crypto value in USD
    const cryptoValueUSD = cryptoAmount * cryptoPriceUSD;
    
    // Gold grams equivalent
    const goldGrams = cryptoValueUSD / goldPricePerGram;
    
    return {
      cryptoAmount,
      cryptoPriceUSD,
      cryptoValueUSD,
      goldPricePerGram,
      goldGrams: parseFloat(goldGrams.toFixed(4)),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate gold to crypto exchange
   */
  async calculateGoldToCrypto(goldGrams, cryptoPriceUSD) {
    const goldPricePerGram = await this.getCurrentGoldPrice();
    
    // Gold value in USD
    const goldValueUSD = goldGrams * goldPricePerGram;
    
    // Crypto amount equivalent
    const cryptoAmount = goldValueUSD / cryptoPriceUSD;
    
    return {
      goldGrams,
      goldPricePerGram,
      goldValueUSD,
      cryptoPriceUSD,
      cryptoAmount: parseFloat(cryptoAmount.toFixed(8)),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear cache (for testing/admin)
   */
  clearCache() {
    this.cache = {
      price: null,
      timestamp: null,
      ttl: this.cache.ttl
    };
    console.log('🗑️ Gold price cache cleared');
  }
}

module.exports = new GoldPriceService();

