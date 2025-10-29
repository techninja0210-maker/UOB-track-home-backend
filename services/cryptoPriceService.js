const { query } = require('../config/database');
const axios = require('axios');

class CryptoPriceService {
  constructor() {
    this.priceCache = new Map();
    this.cacheExpiry = 30000; // 30 second cache for more real-time data
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

  // Fetch prices from Binance API (primary source for real-time data)
  async fetchPricesFromBinance() {
    try {
      console.log('🔄 Fetching real-time prices from Binance API...');
      
      const [btc, eth, ada, sol] = await Promise.all([
        axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
          timeout: 15000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0',
            'Accept': 'application/json'
          }
        }),
        axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', {
          timeout: 15000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0',
            'Accept': 'application/json'
          }
        }),
        axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=ADAUSDT', {
          timeout: 15000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0',
            'Accept': 'application/json'
          }
        }),
        axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT', {
          timeout: 15000,
          headers: {
            'User-Agent': 'TrackPlatform/1.0',
            'Accept': 'application/json'
          }
        })
      ]);

      const result = {
        BTC: {
          price: parseFloat(btc.data.lastPrice),
          change24h: parseFloat(btc.data.priceChangePercent)
        },
        ETH: {
          price: parseFloat(eth.data.lastPrice),
          change24h: parseFloat(eth.data.priceChangePercent)
        },
        ADA: {
          price: parseFloat(ada.data.lastPrice),
          change24h: parseFloat(ada.data.priceChangePercent)
        },
        SOL: {
          price: parseFloat(sol.data.lastPrice),
          change24h: parseFloat(sol.data.priceChangePercent)
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
      console.log('⚠️ Binance API failed, trying database cache...');
      
      // Fallback to database prices
      let prices = await this.getPricesFromDatabase();
      
      if (!prices || Object.keys(prices).length === 0) {
        console.log('⚠️ No database prices, trying CoinGecko...');
        // Fallback to CoinGecko if Binance fails
        prices = await this.fetchPricesFromCoinGecko();
        
        if (prices) {
          console.log('✅ Using CoinGecko API data');
        } else {
          console.log('⚠️ CoinGecko API failed, trying Noones...');
          // Fallback to Noones if both fail
          prices = await this.fetchPricesFromNoones();
          if (prices) {
            console.log('✅ Using Noones API data');
          } else {
            console.log('❌ All APIs failed, using fallback prices');
          }
        }
      } else {
        console.log('✅ Using cached prices from database');
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


