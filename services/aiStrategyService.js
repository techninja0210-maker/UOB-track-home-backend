const marketDataService = require('./marketDataService');
const goldPriceService = require('./goldPriceService');
const { query } = require('../config/database');

class AIStrategyService {
  constructor() {
    this.strategies = {
      gold_buy_low_sell_high: this.goldBuyLowSellHighStrategy.bind(this)
    };
  }

  // Main strategy execution method
  async executeStrategy(botId, strategyType, symbol, params = {}) {
    try {
      // For gold instrument, always use gold strategy regardless of DB enum
      if (symbol === 'XAUUSD') {
        return await this.goldBuyLowSellHighStrategy('XAUUSD', params);
      }
      const strategy = this.strategies[strategyType];
      if (!strategy) {
        throw new Error(`Unknown strategy: ${strategyType}`);
      }

      const signal = await strategy(symbol, params);
      
      // Store the signal in database
      if (signal) {
        await this.storeSignal(symbol, signal);
      }

      return signal;
    } catch (error) {
      console.error(`Error executing strategy ${strategyType} for ${symbol}:`, error.message);
      return null;
    }
  }

  // Gold: Buy low / Sell high strategy using gold price history (price per gram USD)
  async goldBuyLowSellHighStrategy(symbol, params = {}) {
    try {
      // Force symbol to XAUUSD context
      if (symbol !== 'XAUUSD') {
        symbol = 'XAUUSD';
      }

      const { shortPeriod = 20, longPeriod = 50, buyDipPct = 0.5, takeProfitPct = 1.0, stopLossPct = 1.0 } = params;

      // Load recent gold price series from DB via prices history table if available
      // Fallback to current price repeated if no history
      const result = await query(`
        SELECT price_per_gram_usd, created_at
        FROM gold_price_history
        ORDER BY created_at DESC
        LIMIT $1
      `, [Math.max(longPeriod + 5, 60)]);

      let prices = [];
      if (result.rows.length > 0) {
        prices = result.rows
          .map(r => Number(r.price_per_gram_usd))
          .filter(v => Number.isFinite(v))
          .reverse();
      } else {
        // Fallback: synthesize a small series around current price
        const curr = await goldPriceService.getCurrentGoldPrice();
        prices = new Array(longPeriod + 5).fill(0).map((_, i) => curr * (1 + Math.sin(i / 5) * 0.003));
      }

      if (prices.length < longPeriod) return null;

      const smaShort = marketDataService.calculateSMA(prices, shortPeriod);
      const smaLong = marketDataService.calculateSMA(prices, longPeriod);
      const currentPrice = prices[prices.length - 1];

      const signal = {
        type: 'hold',
        confidence: 0,
        price: currentPrice,
        reason: 'No clear edge',
        technical_indicators: {
          sma_short: smaShort,
          sma_long: smaLong,
          current_price: currentPrice
        }
      };

      // Buy condition: price below long SMA by buyDipPct and short SMA turning up
      const belowLongPct = ((smaLong - currentPrice) / smaLong) * 100;
      const smaSlopeUp = prices.slice(-3).reduce((acc, v, i, arr) => i ? acc + (v - arr[i-1]) : acc, 0) > 0;
      if (belowLongPct >= buyDipPct && smaShort <= smaLong && smaSlopeUp) {
        signal.type = 'buy';
        signal.confidence = Math.min(0.9, belowLongPct / (buyDipPct || 0.5));
        signal.reason = `Gold dip: ${belowLongPct.toFixed(2)}% below SMA${longPeriod} with momentum up`;
        return signal;
      }

      // Sell condition: price above long SMA by takeProfitPct or mean reversion from upper deviation
      const aboveLongPct = ((currentPrice - smaLong) / smaLong) * 100;
      if (aboveLongPct >= takeProfitPct) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.9, aboveLongPct / (takeProfitPct || 1));
        signal.reason = `Gold profit: ${aboveLongPct.toFixed(2)}% above SMA${longPeriod}`;
        return signal;
      }

      // Protective sell: recent drop beyond stopLossPct
      const prev = prices[prices.length - 2] || currentPrice;
      const dropPct = ((prev - currentPrice) / prev) * 100;
      if (dropPct >= stopLossPct) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.8, dropPct / (stopLossPct || 1));
        signal.reason = `Gold stop: drop ${dropPct.toFixed(2)}%`;
        return signal;
      }

      return signal;
    } catch (error) {
      console.error('Gold strategy error:', error.message);
      return null;
    }
  }


  // Helper method to calculate SMA for historical data
  async calculateSMAForHistory(historicalData, shortPeriod, longPeriod) {
    if (historicalData.length < longPeriod) return null;

    const prices = historicalData.map(candle => candle.close_price);
    
    return {
      sma_short: marketDataService.calculateSMA(prices, shortPeriod),
      sma_long: marketDataService.calculateSMA(prices, longPeriod)
    };
  }

  // Store signal in database
  async storeSignal(symbol, signal) {
    try {
      await query(`
        INSERT INTO ai_signals (symbol, signal_type, confidence, price, technical_indicators, ai_analysis)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        symbol,
        signal.type,
        signal.confidence,
        signal.price,
        JSON.stringify(signal.technical_indicators),
        JSON.stringify({ reason: signal.reason })
      ]);
    } catch (error) {
      console.error('Error storing signal:', error.message);
    }
  }

  // Get last trade for a symbol
  async getLastTradeForSymbol(symbol) {
    try {
      const result = await query(`
        SELECT * FROM bot_trades 
        WHERE symbol = $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `, [symbol]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting last trade:', error.message);
      return null;
    }
  }

  // Get recent signals for a symbol
  async getRecentSignals(symbol, limit = 10) {
    try {
      const result = await query(`
        SELECT * FROM ai_signals 
        WHERE symbol = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [symbol, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting recent signals:', error.message);
      return [];
    }
  }
}

module.exports = new AIStrategyService();
