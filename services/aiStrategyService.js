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

  // Gold: Buy low / Sell high strategy with Bollinger Bands + RSI + trend filter
  async goldBuyLowSellHighStrategy(symbol, params = {}) {
    try {
      // Force symbol to XAUUSD context
      if (symbol !== 'XAUUSD') {
        symbol = 'XAUUSD';
      }

      const {
        shortPeriod = 20,
        longPeriod = 50,
        bbPeriod = 20,
        bbStdDev = 2,
        rsiPeriod = 14,
        rsiBuy = 45,
        rsiSell = 55,
        minTakeProfitPct = 0.8,
        stopLossPct = 0.6,
        cooldownMinutes = 5
      } = params;

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
      const bb = marketDataService.calculateBollingerBands(prices, bbPeriod, bbStdDev);
      const rsi = marketDataService.calculateRSI(prices, rsiPeriod);
      const currentPrice = prices[prices.length - 1];

      const signal = {
        type: 'hold',
        confidence: 0,
        price: currentPrice,
        reason: 'No clear edge',
        technical_indicators: {
          sma_short: smaShort,
          sma_long: smaLong,
          bollinger: bb,
          rsi,
          current_price: currentPrice
        }
      };

      // Cooldown after last trade to avoid churn
      try {
        const lastTrade = await this.getLastTradeForSymbol('XAUUSD');
        if (lastTrade && lastTrade.created_at) {
          const lastTs = new Date(lastTrade.created_at).getTime();
          if (Date.now() - lastTs < cooldownMinutes * 60 * 1000) {
            signal.reason = `Cooldown active (${cooldownMinutes}m)`;
            return signal;
          }
        }
      } catch (_) {}

      // Trend filter: prefer longs when SMA20 >= SMA50
      const upTrend = smaShort && smaLong ? smaShort >= smaLong : false;
      const recentSlope = prices.slice(-4).reduce((acc, v, i, arr) => i ? acc + (v - arr[i-1]) : acc, 0);
      const momentumUp = recentSlope > 0;

      // Buy: price near/below lower band with RSI not overbought, and trend/momentum supportive
      if (bb && rsi !== null) {
        const nearLower = currentPrice <= bb.lower * 1.002; // within 0.2% of lower band
        if (nearLower && rsi <= rsiBuy && (upTrend || momentumUp)) {
          signal.type = 'buy';
          const distance = Math.max(0.1, ((bb.middle - currentPrice) / bb.middle) * 100);
          signal.confidence = Math.min(0.95, 0.5 + distance / 2);
          signal.reason = `Lower band touch with RSI ${rsi.toFixed(1)} and trend OK`;
          return signal;
        }
      }

      // Take-profit or mean reversion: price near/above upper band or profitable from last buy
      if (bb && rsi !== null) {
        const nearUpper = currentPrice >= bb.upper * 0.998; // within 0.2% of upper band
        if (nearUpper && rsi >= rsiSell) {
          signal.type = 'sell';
          const distance = Math.max(0.1, ((currentPrice - bb.middle) / bb.middle) * 100);
          signal.confidence = Math.min(0.95, 0.5 + distance / 2);
          signal.reason = `Upper band touch with RSI ${rsi.toFixed(1)}`;
          return signal;
        }
      }

      // Trailing stop / protective sell from last trade
      try {
        const lastTrade = await this.getLastTradeForSymbol('XAUUSD');
        if (lastTrade && lastTrade.side === 'buy') {
          const entry = Number(lastTrade.price) || currentPrice;
          const pnlPct = ((currentPrice - entry) / entry) * 100;
          if (pnlPct >= minTakeProfitPct) {
            signal.type = 'sell';
            signal.confidence = Math.min(0.9, pnlPct / minTakeProfitPct);
            signal.reason = `Take profit: +${pnlPct.toFixed(2)}% since last buy`;
            return signal;
          }
          const drawdownPct = ((entry - currentPrice) / entry) * 100;
          if (drawdownPct >= stopLossPct) {
            signal.type = 'sell';
            signal.confidence = Math.min(0.85, drawdownPct / stopLossPct);
            signal.reason = `Stop loss: -${drawdownPct.toFixed(2)}% from entry`;
            return signal;
          }
        }
      } catch (_) {}

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
