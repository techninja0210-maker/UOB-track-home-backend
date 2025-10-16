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

      // Noones API endpoint for crypto prices
      const response = await axios.get(
        'https://dev.noones.com/api/v1/prices',
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 5000
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
          timeout: 5000
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
      const [btc, eth, usdt] = await Promise.all([
        axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
        axios.get('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'),
        axios.get('https://api.binance.com/api/v3/ticker/price?symbol=USDTUSDT')
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

    // Fetch fresh prices - try Noones API first
    let prices = await this.fetchPricesFromNoones();
    
    // Fallback to CoinGecko if Noones fails
    if (!prices) {
      prices = await this.fetchPricesFromCoinGecko();
    }
    
    // Fallback to Binance if both fail
    if (!prices) {
      prices = await this.fetchPricesFromBinance();
    }

    // Fallback to database if both APIs fail
    if (!prices) {
      prices = await this.getPricesFromDatabase();
    }

    // Update cache
    if (prices) {
      this.priceCache.set('BTC', prices.BTC);
      this.priceCache.set('ETH', prices.ETH);
      this.priceCache.set('USDT', prices.USDT);
      this.priceCache.set('lastUpdate', now);

      // Update database
      await this.updatePricesInDatabase(prices);
    }

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

      return prices;
    } catch (error) {
      console.error('Database price fetch error:', error);
      return { BTC: 60000, ETH: 3000, USDT: 1.0 }; // Fallback defaults
    }
  }

  // Update prices in database
  async updatePricesInDatabase(prices) {
    try {
      for (const [symbol, price] of Object.entries(prices)) {
        // Update current price
        await query(
          `UPDATE crypto_currencies 
           SET current_price_usd = $1, last_updated = CURRENT_TIMESTAMP
           WHERE symbol = $2`,
          [price, symbol]
        );

        // Log price history
        await query(
          `INSERT INTO crypto_price_history (currency_symbol, price_usd, source)
           VALUES ($1, $2, 'live_api')`,
          [symbol, price]
        );
      }
    } catch (error) {
      console.error('Database price update error:', error);
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


