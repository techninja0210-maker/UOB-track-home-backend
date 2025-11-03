const { query } = require('../config/database');
const axios = require('axios');

class CryptoPriceService {
  constructor() {
    this.priceCache = new Map();
    this.cacheExpiry = 60 * 1000; // 60 seconds (increased to reduce API calls)
    this.lastRequestTime = 0;
    this.minRequestInterval = 2000; // Minimum 2 seconds between requests
    this.requestCount = 0;
    this.requestWindow = 60 * 1000; // 1 minute window
    this.maxRequestsPerMinute = 30; // Conservative limit
  }

  // Rate limiting helper
  async checkRateLimit() {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.lastRequestTime > this.requestWindow) {
      this.requestCount = 0;
    }
    
    // Check if we've exceeded the limit
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = this.requestWindow - (now - this.lastRequestTime);
      console.log(`⚠️ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  // Fetch prices from Noones API (primary source)
  async fetchPricesFromNoones() {
    try {
      // Skip Noones API if credentials not configured
      if (!process.env.NOONES_API_KEY || process.env.NOONES_API_KEY === 'your_noones_api_key_here') {
        return null;
      }

      // Noones API endpoint for crypto prices - use correct endpoint
      const response = await axios.get(
        'https://api.noones.com/api/v1/prices',
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NOONES_API_KEY}`
          },
          timeout: 10000 // Increased timeout
        }
      );

      // Parse Noones API response format
      if (response.data && response.data.data) {
        const prices = {};
        response.data.data.forEach(coin => {
          if (coin.symbol === 'BTC') prices.BTC = parseFloat(coin.price_usd);
          if (coin.symbol === 'ETH') prices.ETH = parseFloat(coin.price_usd);
          if (coin.symbol === 'USDT') prices.USDT = parseFloat(coin.price_usd);
        });
        
        // Ensure we have all required currencies
        if (prices.BTC && prices.ETH && prices.USDT) {
          return prices;
        }
      }
      
      return null;
    } catch (error) {
      // Only log if credentials are configured (not placeholder values)
      if (process.env.NOONES_API_KEY && process.env.NOONES_API_KEY !== 'your_noones_api_key_here') {
        console.error('Noones API error:', error.message);
      }
      return null;
    }
  }

  // Fetch prices from CoinGecko API (fallback)
  async fetchPricesFromCoinGecko() {
    try {
      // Use Pro API if key is available, otherwise use free tier
      const apiKey = process.env.COINGECKO_API_KEY;
      const baseUrl = apiKey ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
      
      if (apiKey) {
        console.log('🔄 Fetching prices from CoinGecko Pro API...');
      } else {
        console.log('🔄 Fetching prices from CoinGecko Free API...');
      }
      
      const params = {
        ids: 'bitcoin,ethereum,tether,cardano,solana',
        vs_currencies: 'usd',
        include_24hr_change: true
      };
      
      // Add API key to params if available
      if (apiKey) {
        params.x_cg_pro_api_key = apiKey;
      }
      
      const response = await axios.get(`${baseUrl}/simple/price`, {
        params,
        timeout: 15000,
        headers: {
          'User-Agent': 'TrackPlatform/1.0'
        }
      });

      const result = {
        BTC: response.data.bitcoin.usd,
        ETH: response.data.ethereum.usd,
        USDT: response.data.tether.usd,
        ADA: response.data.cardano.usd,
        SOL: response.data.solana.usd,
        // Store 24h change data
        BTC_change24h: response.data.bitcoin.usd_24h_change || 0,
        ETH_change24h: response.data.ethereum.usd_24h_change || 0,
        ADA_change24h: response.data.cardano.usd_24h_change || 0,
        SOL_change24h: response.data.solana.usd_24h_change || 0
      };

      console.log('✅ CoinGecko API Success - Prices fetched:');
      console.log(`   BTC: $${result.BTC.toLocaleString()} (${result.BTC_change24h > 0 ? '+' : ''}${result.BTC_change24h.toFixed(2)}%)`);
      console.log(`   ETH: $${result.ETH.toLocaleString()} (${result.ETH_change24h > 0 ? '+' : ''}${result.ETH_change24h.toFixed(2)}%)`);
      console.log(`   ADA: $${result.ADA.toLocaleString()} (${result.ADA_change24h > 0 ? '+' : ''}${result.ADA_change24h.toFixed(2)}%)`);
      console.log(`   SOL: $${result.SOL.toLocaleString()} (${result.SOL_change24h > 0 ? '+' : ''}${result.SOL_change24h.toFixed(2)}%)`);

      return result;
    } catch (error) {
      console.error('❌ CoinGecko API error:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', error.response.data);
      }
      return null;
    }
  }

  // Fetch prices from Binance API (primary source for real-time data)
  async fetchPricesFromBinance() {
    try {
      // Apply rate limiting
      await this.checkRateLimit();
      
      console.log('🔄 Fetching real-time prices from Binance API...');
      
      // Get API credentials
      const apiKey = process.env.EXCHANGE_API_KEY || process.env.BINANCE_API_KEY;
      const apiSecret = process.env.EXCHANGE_API_SECRET || process.env.BINANCE_SECRET_KEY;
      
      // Prepare headers
      const headers = {
        'User-Agent': 'TrackPlatform/1.0',
        'Accept': 'application/json'
      };
      
      // Add API key to headers if available
      if (apiKey && apiKey !== 'your_binance_api_key_here' && apiKey !== 'your_exchange_api_key_here') {
        headers['X-MBX-APIKEY'] = apiKey;
        console.log('🔑 Using Binance API key for enhanced rate limits');
      } else {
        console.log('⚠️ No Binance API key found, using public endpoints');
      }
      
      // Use single API call instead of multiple parallel calls to reduce rate limit usage
      // Binance supports multiple symbols in one request
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
        params: {
          symbols: JSON.stringify(['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'])
        },
        timeout: 15000,
        headers
      });
      
      // Process the response data
      const data = response.data;
      const btc = data.find(item => item.symbol === 'BTCUSDT');
      const eth = data.find(item => item.symbol === 'ETHUSDT');
      const ada = data.find(item => item.symbol === 'ADAUSDT');
      const sol = data.find(item => item.symbol === 'SOLUSDT');

      const result = {
        BTC: {
          price: parseFloat(btc.lastPrice),
          change24h: parseFloat(btc.priceChangePercent)
        },
        ETH: {
          price: parseFloat(eth.lastPrice),
          change24h: parseFloat(eth.priceChangePercent)
        },
        ADA: {
          price: parseFloat(ada.lastPrice),
          change24h: parseFloat(ada.priceChangePercent)
        },
        SOL: {
          price: parseFloat(sol.lastPrice),
          change24h: parseFloat(sol.priceChangePercent)
        },
        USDT: {
          price: 1.0,
          change24h: 0.0
        }
      };

      console.log('✅ Binance API Success - Real-time prices fetched:');
      console.log(`   BTC: $${result.BTC.price.toLocaleString()} (${result.BTC.change24h > 0 ? '+' : ''}${result.BTC.change24h}%)`);
      console.log(`   ETH: $${result.ETH.price.toLocaleString()} (${result.ETH.change24h > 0 ? '+' : ''}${result.ETH.change24h}%)`);
      console.log(`   ADA: $${result.ADA.price.toLocaleString()} (${result.ADA.change24h > 0 ? '+' : ''}${result.ADA.change24h}%)`);
      console.log(`   SOL: $${result.SOL.price.toLocaleString()} (${result.SOL.change24h > 0 ? '+' : ''}${result.SOL.change24h}%)`);

      return result;
    } catch (error) {
      console.error('❌ Binance API error:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', error.response.data);
        
        // If rate limited, suggest using CoinGecko
        if (error.response.status === 429) {
          console.log('⚠️ Binance rate limit exceeded. Consider using CoinGecko API as fallback.');
        }
      }
      return null;
    }
  }

  // Get current prices with caching
  async getCurrentPrices(forceRefresh = false) {
    const now = Date.now();
    
    // Check cache - but always try to get fresh data for real-time accuracy
    if (!forceRefresh && this.priceCache.has('lastUpdate')) {
      const lastUpdate = this.priceCache.get('lastUpdate');
      if (now - lastUpdate < this.cacheExpiry) {
        console.log('✅ Using cached prices (within 30s)');
        return {
          BTC: this.priceCache.get('BTC'),
          ETH: this.priceCache.get('ETH'),
          USDT: this.priceCache.get('USDT'),
          BTC_change24h: this.priceCache.get('BTC_change24h') || 0,
          ETH_change24h: this.priceCache.get('ETH_change24h') || 0,
          ADA_change24h: this.priceCache.get('ADA_change24h') || 0,
          SOL_change24h: this.priceCache.get('SOL_change24h') || 0,
          cached: true,
          lastUpdate: new Date(lastUpdate)
        };
      }
    }

    // Always try to get fresh data from Binance API first for real-time accuracy
    console.log('🔄 Fetching fresh real-time data from Binance API...');
    
    // Fetch fresh prices - try Binance first (most real-time and accurate)
    const binanceData = await this.fetchPricesFromBinance();
    
    if (binanceData) {
      console.log('✅ Using fresh Binance API data');
      // Convert Binance data structure to our format
      const prices = {
        BTC: binanceData.BTC.price,
        ETH: binanceData.ETH.price,
        USDT: binanceData.USDT.price,
        ADA: binanceData.ADA.price,
        SOL: binanceData.SOL.price
      };
      
      // Store 24h change data separately for frontend
      this.priceCache.set('BTC_change24h', binanceData.BTC.change24h);
      this.priceCache.set('ETH_change24h', binanceData.ETH.change24h);
      this.priceCache.set('ADA_change24h', binanceData.ADA.change24h);
      this.priceCache.set('SOL_change24h', binanceData.SOL.change24h);
      
      // Update cache
      this.priceCache.set('BTC', prices.BTC);
      this.priceCache.set('ETH', prices.ETH);
      this.priceCache.set('USDT', prices.USDT);
      this.priceCache.set('lastUpdate', now);

      // Update database (don't wait for it to complete)
      this.updatePricesInDatabase(prices).catch(err => {
        console.error('Database update failed:', err.message);
      });

      return {
        ...prices,
        BTC_change24h: binanceData.BTC.change24h,
        ETH_change24h: binanceData.ETH.change24h,
        ADA_change24h: binanceData.ADA.change24h,
        SOL_change24h: binanceData.SOL.change24h,
        cached: false,
        lastUpdate: new Date(now)
      };
    } else {
      console.log('⚠️ Binance API failed, trying CoinGecko API...');
      
      // Fallback to CoinGecko API
      let prices = await this.fetchPricesFromCoinGecko();
      
      if (prices) {
        console.log('✅ Using CoinGecko API data');
        
        // Store 24h change data from CoinGecko
        this.priceCache.set('BTC_change24h', prices.BTC_change24h || 0);
        this.priceCache.set('ETH_change24h', prices.ETH_change24h || 0);
        this.priceCache.set('ADA_change24h', prices.ADA_change24h || 0);
        this.priceCache.set('SOL_change24h', prices.SOL_change24h || 0);
      } else {
        console.log('⚠️ CoinGecko API failed, trying database cache...');
        
        // Fallback to database prices
        prices = await this.getPricesFromDatabase();
        
        if (!prices || Object.keys(prices).length === 0) {
          console.log('⚠️ No database prices, trying Noones...');
          // Fallback to Noones if both fail
          prices = await this.fetchPricesFromNoones();
          if (prices) {
            console.log('✅ Using Noones API data');
          } else {
            console.log('❌ All APIs failed, using fallback prices');
          }
        } else {
          console.log('✅ Using cached prices from database');
        }
      }

      // Final fallback to default prices
      if (!prices || Object.keys(prices).length === 0) {
        console.log('🔄 Using fallback prices');
        prices = { BTC: 112547, ETH: 3972, USDT: 1.0, ADA: 0.45, SOL: 98.50 };
      }

      // Update cache
      this.priceCache.set('BTC', prices.BTC);
      this.priceCache.set('ETH', prices.ETH);
      this.priceCache.set('USDT', prices.USDT);
      this.priceCache.set('lastUpdate', now);

      // Update database (don't wait for it to complete)
      this.updatePricesInDatabase(prices).catch(err => {
        console.error('Database update failed:', err.message);
      });

      return {
        ...prices,
        BTC_change24h: this.priceCache.get('BTC_change24h') || 0,
        ETH_change24h: this.priceCache.get('ETH_change24h') || 0,
        ADA_change24h: this.priceCache.get('ADA_change24h') || 0,
        SOL_change24h: this.priceCache.get('SOL_change24h') || 0,
        cached: false,
        lastUpdate: new Date(now)
      };
    }
  }

  // Get prices from database
  async getPricesFromDatabase() {
    try {
      const result = await query(
        'SELECT symbol, current_price_usd FROM crypto_currencies WHERE symbol IN ($1, $2, $3)',
        ['BTC', 'ETH', 'USDT']
      );

      const prices = {};
      result.rows.forEach(row => {
        prices[row.symbol] = parseFloat(row.current_price_usd);
      });

      // Only return if we have all three currencies
      if (prices.BTC && prices.ETH && prices.USDT) {
        return prices;
      }
      
      return null; // Return null if incomplete data
    } catch (error) {
      console.error('Database price fetch error:', error.message);
      return null; // Return null to trigger API fallback
    }
  }

  // Update prices in database
  async updatePricesInDatabase(prices) {
    try {
      for (const [symbol, price] of Object.entries(prices)) {
        // Update current price with timeout protection
        try {
          await Promise.race([
            query(
              `UPDATE crypto_currencies 
               SET current_price_usd = $1, last_updated = CURRENT_TIMESTAMP
               WHERE symbol = $2`,
              [price, symbol]
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database update timeout')), 8000)
            )
          ]);
        } catch (updateError) {
          // Don't log timeout errors (expected in case of DB slow response)
          if (!updateError.message?.includes('timeout') && !updateError.message?.includes('Timeout')) {
            console.error(`Database update error for ${symbol}:`, updateError.message);
          }
        }

        // Log price history (non-blocking, fire and forget)
        query(
          `INSERT INTO crypto_price_history (currency_symbol, price_usd, source)
           VALUES ($1, $2, 'live_api')`,
          [symbol, price]
        ).catch(() => {
          // Silently ignore - price history is non-critical
        });
      }
    } catch (error) {
      // Only log non-timeout errors
      if (error && error.message && !error.message.includes('timeout') && !error.message.includes('Timeout')) {
        console.error('Database price update error:', error.message);
      }
    }
  }

  // Start automatic price updates (call this in server.js)
  startPriceUpdates(intervalMs = 60000) {
    // Update immediately
    this.getCurrentPrices(true);

    // Then update every minute
    setInterval(() => {
      this.getCurrentPrices(true).catch(err => {
        console.error('Price update error:', err);
      });
    }, intervalMs);

    console.log('✅ Crypto price updates started (every', intervalMs / 1000, 'seconds)');
  }
}

// Export singleton instance
module.exports = new CryptoPriceService();


