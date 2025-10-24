const { query } = require('../config/database');
const axios = require('axios');

class CryptoPriceService {
  constructor() {
    this.priceCache = new Map();
    this.cacheExpiry = 60000; // 1 minute cache
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
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: 'bitcoin,ethereum,tether',
            vs_currencies: 'usd'
          },
          timeout: 15000, // Increased timeout
          headers: {
            'User-Agent': 'TrackPlatform/1.0'
          }
        }
      );

      return {
        BTC: response.data.bitcoin.usd,
        ETH: response.data.ethereum.usd,
        USDT: response.data.tether.usd
      };
    } catch (error) {
      console.error('CoinGecko API error:', error.message);
      return null;
    }
  }

  // Fetch prices from Binance API (backup)
  async fetchPricesFromBinance() {
    try {
      const [btc, eth] = await Promise.all([
        axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
          timeout: 10000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0'
          }
        }),
        axios.get('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', {
          timeout: 10000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0'
          }
        })
      ]);

      return {
        BTC: parseFloat(btc.data.price),
        ETH: parseFloat(eth.data.price),
        USDT: 1.0 // USDT is pegged to USD
      };
    } catch (error) {
      console.error('Binance API error:', error.message);
      return null;
    }
  }

  // Get current prices with caching
  async getCurrentPrices(forceRefresh = false) {
    const now = Date.now();
    
    // Check cache
    if (!forceRefresh && this.priceCache.has('lastUpdate')) {
      const lastUpdate = this.priceCache.get('lastUpdate');
      if (now - lastUpdate < this.cacheExpiry) {
        return {
          BTC: this.priceCache.get('BTC'),
          ETH: this.priceCache.get('ETH'),
          USDT: this.priceCache.get('USDT'),
          cached: true,
          lastUpdate: new Date(lastUpdate)
        };
      }
    }

    // Try to get prices from database first (fastest)
    let prices = await this.getPricesFromDatabase();
    
    // If no database prices or they're too old, try APIs
    if (!prices || Object.keys(prices).length === 0) {
      // Fetch fresh prices - try CoinGecko first (most reliable)
      prices = await this.fetchPricesFromCoinGecko();
      
      // Fallback to Binance if CoinGecko fails
      if (!prices) {
        prices = await this.fetchPricesFromBinance();
      }
      
      // Fallback to Noones if both fail
      if (!prices) {
        prices = await this.fetchPricesFromNoones();
      }
    }

    // Final fallback to default prices
    if (!prices || Object.keys(prices).length === 0) {
      prices = { BTC: 60000, ETH: 3000, USDT: 1.0 };
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
      cached: false,
      lastUpdate: new Date(now)
    };
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
        // Update current price with timeout
        await Promise.race([
          query(
            `UPDATE crypto_currencies 
             SET current_price_usd = $1, last_updated = CURRENT_TIMESTAMP
             WHERE symbol = $2`,
            [price, symbol]
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database update timeout')), 10000)
          )
        ]);

        // Log price history (don't wait for completion)
        query(
          `INSERT INTO crypto_price_history (currency_symbol, price_usd, source)
           VALUES ($1, $2, 'live_api')`,
          [symbol, price]
        ).catch(err => {
          console.error('Price history insert failed:', err.message);
        });
      }
    } catch (error) {
      console.error('Database price update error:', error.message);
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


