const { query } = require('../config/database');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30000; // 30 seconds
  }

  // Note: Crypto price fetching removed for gold-only system.

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

  // Get technical indicators (gold-only: compute from gold_price_history)
  async getTechnicalIndicators(symbol, timeframe = '1h') {
    try {
      if (symbol !== 'XAUUSD') return null;
      const hist = await query(`
        SELECT price_per_gram_usd, created_at
        FROM gold_price_history
        ORDER BY created_at ASC
        LIMIT 120
      `);
      const prices = hist.rows.map(r => Number(r.price_per_gram_usd)).filter(v => Number.isFinite(v));
      if (prices.length < 20) return null;
      return {
        sma_20: this.calculateSMA(prices, 20),
        sma_50: this.calculateSMA(prices, 50),
        ema_12: this.calculateEMA(prices, 12),
        ema_26: this.calculateEMA(prices, 26),
        rsi: this.calculateRSI(prices, 14),
        bollinger: this.calculateBollingerBands(prices, 20, 2),
        current_price: prices[prices.length - 1],
        volume: 0
      };
    } catch (error) {
      console.error(`Error calculating gold technical indicators:`, error.message);
      return null;
    }
  }

  // Data collection removed for gold-only system
}

module.exports = new MarketDataService();
