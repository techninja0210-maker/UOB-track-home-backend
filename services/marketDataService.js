const axios = require('axios');
const { query } = require('../config/database');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30000; // 30 seconds
  }

  // Get real-time price from Binance
  async getCurrentPrice(symbol) {
    try {
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
        timeout: 5000,
        headers: { 'User-Agent': 'TrackPlatform-AI-Bot/1.0' }
      });
      
      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.price),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      return null;
    }
  }

  // Get multiple prices at once
  async getCurrentPrices(symbols) {
    try {
      const promises = symbols.map(symbol => this.getCurrentPrice(symbol));
      const results = await Promise.allSettled(promises);
      
      const prices = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          prices[symbols[index]] = result.value.price;
        }
      });
      
      return prices;
    } catch (error) {
      console.error('Error fetching multiple prices:', error.message);
      return {};
    }
  }

  // Get historical kline data for technical analysis
  async getKlineData(symbol, interval = '1h', limit = 100) {
    try {
      const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
          symbol: symbol,
          interval: interval,
          limit: limit
        },
        timeout: 10000,
        headers: { 'User-Agent': 'TrackPlatform-AI-Bot/1.0' }
      });

      return response.data.map(kline => ({
        openTime: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        closeTime: kline[6]
      }));
    } catch (error) {
      console.error(`Error fetching kline data for ${symbol}:`, error.message);
      return [];
    }
  }

  // Store market data in database
  async storeMarketData(symbol, timeframe, klineData) {
    try {
      const values = klineData.map(kline => [
        symbol,
        timeframe,
        new Date(kline.openTime),
        new Date(kline.closeTime),
        kline.open,
        kline.high,
        kline.low,
        kline.close,
        kline.volume
      ]);

      const queryText = `
        INSERT INTO market_data (symbol, timeframe, open_time, close_time, open_price, high_price, low_price, close_price, volume)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (symbol, timeframe, open_time) DO UPDATE SET
          close_time = EXCLUDED.close_time,
          open_price = EXCLUDED.open_price,
          high_price = EXCLUDED.high_price,
          low_price = EXCLUDED.low_price,
          close_price = EXCLUDED.close_price,
          volume = EXCLUDED.volume
      `;

      for (const value of values) {
        await query(queryText, value);
      }
    } catch (error) {
      console.error('Error storing market data:', error.message);
    }
  }

  // Get historical data from database
  async getHistoricalData(symbol, timeframe, limit = 100) {
    try {
      const result = await query(`
        SELECT open_time, close_time, open_price, high_price, low_price, close_price, volume
        FROM market_data
        WHERE symbol = $1 AND timeframe = $2
        ORDER BY open_time DESC
        LIMIT $3
      `, [symbol, timeframe, limit]);

      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error fetching historical data:', error.message);
      return [];
    }
  }

  // Calculate Simple Moving Average
  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const recentPrices = prices.slice(-period);
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  // Calculate Exponential Moving Average
  calculateEMA(prices, period) {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  // Calculate RSI
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // Calculate Bollinger Bands
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;
    
    const sma = this.calculateSMA(prices, period);
    const recentPrices = prices.slice(-period);
    
    const variance = recentPrices.reduce((acc, price) => {
      return acc + Math.pow(price - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  // Get technical indicators for a symbol
  async getTechnicalIndicators(symbol, timeframe = '1h') {
    try {
      // Get historical data
      let historicalData = await this.getHistoricalData(symbol, timeframe, 100);
      
      // If not enough data in DB, fetch from API
      if (historicalData.length < 50) {
        const klineData = await this.getKlineData(symbol, timeframe, 100);
        if (klineData.length > 0) {
          await this.storeMarketData(symbol, timeframe, klineData);
          historicalData = await this.getHistoricalData(symbol, timeframe, 100);
        }
      }
      
      if (historicalData.length < 20) {
        return null;
      }
      
      const prices = historicalData.map(candle => candle.close_price);
      
      return {
        sma_20: this.calculateSMA(prices, 20),
        sma_50: this.calculateSMA(prices, 50),
        ema_12: this.calculateEMA(prices, 12),
        ema_26: this.calculateEMA(prices, 26),
        rsi: this.calculateRSI(prices, 14),
        bollinger: this.calculateBollingerBands(prices, 20, 2),
        current_price: prices[prices.length - 1],
        volume: historicalData[historicalData.length - 1].volume
      };
    } catch (error) {
      console.error(`Error calculating technical indicators for ${symbol}:`, error.message);
      return null;
    }
  }

  // Start real-time data collection
  startDataCollection(symbols = ['BTCUSDT', 'ETHUSDT'], interval = '1h') {
    console.log('🔄 Starting market data collection for AI trading...');
    
    // Collect data immediately
    this.collectDataForSymbols(symbols, interval);
    
    // Then collect every 5 minutes
    setInterval(() => {
      this.collectDataForSymbols(symbols, interval);
    }, 300000); // 5 minutes
  }

  async collectDataForSymbols(symbols, interval) {
    for (const symbol of symbols) {
      try {
        const klineData = await this.getKlineData(symbol, interval, 10);
        if (klineData.length > 0) {
          await this.storeMarketData(symbol, interval, klineData);
        }
      } catch (error) {
        console.error(`Error collecting data for ${symbol}:`, error.message);
      }
    }
  }
}

module.exports = new MarketDataService();
