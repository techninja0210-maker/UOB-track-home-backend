const marketDataService = require('./marketDataService');
const { query } = require('../config/database');

class AIStrategyService {
  constructor() {
    this.strategies = {
      sma_crossover: this.smaCrossoverStrategy.bind(this),
      rsi_mean_reversion: this.rsiMeanReversionStrategy.bind(this),
      bollinger_bands: this.bollingerBandsStrategy.bind(this),
      momentum: this.momentumStrategy.bind(this),
      dca: this.dcaStrategy.bind(this)
    };
  }

  // Main strategy execution method
  async executeStrategy(botId, strategyType, symbol, params = {}) {
    try {
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

  // SMA Crossover Strategy
  async smaCrossoverStrategy(symbol, params = {}) {
    const { shortPeriod = 20, longPeriod = 50 } = params;
    
    try {
      const indicators = await marketDataService.getTechnicalIndicators(symbol, '1h');
      if (!indicators) return null;

      const { sma_20, sma_50, current_price } = indicators;
      
      if (!sma_20 || !sma_50) return null;

      // Get previous values for crossover detection
      const historicalData = await marketDataService.getHistoricalData(symbol, '1h', 3);
      if (historicalData.length < 3) return null;

      const prevIndicators = await this.calculateSMAForHistory(historicalData.slice(0, -1), shortPeriod, longPeriod);
      
      if (!prevIndicators) return null;

      const signal = {
        type: 'hold',
        confidence: 0,
        price: current_price,
        reason: 'No clear signal',
        technical_indicators: {
          sma_short: sma_20,
          sma_long: sma_50,
          current_price: current_price
        }
      };

      // Bullish crossover: short SMA crosses above long SMA
      if (prevIndicators.sma_short <= prevIndicators.sma_long && sma_20 > sma_50) {
        signal.type = 'buy';
        signal.confidence = Math.min(0.9, Math.abs(sma_20 - sma_50) / sma_50 * 10);
        signal.reason = `SMA Crossover: ${shortPeriod} SMA crossed above ${longPeriod} SMA`;
      }
      // Bearish crossover: short SMA crosses below long SMA
      else if (prevIndicators.sma_short >= prevIndicators.sma_long && sma_20 < sma_50) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.9, Math.abs(sma_20 - sma_50) / sma_50 * 10);
        signal.reason = `SMA Crossover: ${shortPeriod} SMA crossed below ${longPeriod} SMA`;
      }

      return signal;
    } catch (error) {
      console.error('SMA Crossover strategy error:', error.message);
      return null;
    }
  }

  // RSI Mean Reversion Strategy
  async rsiMeanReversionStrategy(symbol, params = {}) {
    const { oversold = 30, overbought = 70 } = params;
    
    try {
      const indicators = await marketDataService.getTechnicalIndicators(symbol, '1h');
      if (!indicators || !indicators.rsi) return null;

      const { rsi, current_price } = indicators;
      
      const signal = {
        type: 'hold',
        confidence: 0,
        price: current_price,
        reason: 'RSI in neutral zone',
        technical_indicators: {
          rsi: rsi,
          current_price: current_price
        }
      };

      // Oversold: Buy signal
      if (rsi < oversold) {
        signal.type = 'buy';
        signal.confidence = Math.min(0.9, (oversold - rsi) / oversold);
        signal.reason = `RSI Oversold: ${rsi.toFixed(2)} < ${oversold}`;
      }
      // Overbought: Sell signal
      else if (rsi > overbought) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.9, (rsi - overbought) / (100 - overbought));
        signal.reason = `RSI Overbought: ${rsi.toFixed(2)} > ${overbought}`;
      }

      return signal;
    } catch (error) {
      console.error('RSI Mean Reversion strategy error:', error.message);
      return null;
    }
  }

  // Bollinger Bands Strategy
  async bollingerBandsStrategy(symbol, params = {}) {
    try {
      const indicators = await marketDataService.getTechnicalIndicators(symbol, '1h');
      if (!indicators || !indicators.bollinger) return null;

      const { bollinger, current_price } = indicators;
      
      const signal = {
        type: 'hold',
        confidence: 0,
        price: current_price,
        reason: 'Price within Bollinger Bands',
        technical_indicators: {
          bollinger_upper: bollinger.upper,
          bollinger_middle: bollinger.middle,
          bollinger_lower: bollinger.lower,
          current_price: current_price
        }
      };

      // Price touches lower band: Buy signal
      if (current_price <= bollinger.lower) {
        signal.type = 'buy';
        signal.confidence = Math.min(0.9, (bollinger.middle - current_price) / (bollinger.middle - bollinger.lower));
        signal.reason = `Price touched lower Bollinger Band`;
      }
      // Price touches upper band: Sell signal
      else if (current_price >= bollinger.upper) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.9, (current_price - bollinger.middle) / (bollinger.upper - bollinger.middle));
        signal.reason = `Price touched upper Bollinger Band`;
      }

      return signal;
    } catch (error) {
      console.error('Bollinger Bands strategy error:', error.message);
      return null;
    }
  }

  // Momentum Strategy
  async momentumStrategy(symbol, params = {}) {
    const { lookbackPeriod = 14, threshold = 0.02 } = params;
    
    try {
      const historicalData = await marketDataService.getHistoricalData(symbol, '1h', lookbackPeriod + 1);
      if (historicalData.length < lookbackPeriod + 1) return null;

      const currentPrice = historicalData[historicalData.length - 1].close_price;
      const pastPrice = historicalData[historicalData.length - 1 - lookbackPeriod].close_price;
      
      const momentum = (currentPrice - pastPrice) / pastPrice;
      
      const signal = {
        type: 'hold',
        confidence: 0,
        price: currentPrice,
        reason: 'Insufficient momentum',
        technical_indicators: {
          momentum: momentum,
          current_price: currentPrice,
          past_price: pastPrice
        }
      };

      // Strong upward momentum: Buy
      if (momentum > threshold) {
        signal.type = 'buy';
        signal.confidence = Math.min(0.9, momentum / threshold);
        signal.reason = `Strong upward momentum: ${(momentum * 100).toFixed(2)}%`;
      }
      // Strong downward momentum: Sell
      else if (momentum < -threshold) {
        signal.type = 'sell';
        signal.confidence = Math.min(0.9, Math.abs(momentum) / threshold);
        signal.reason = `Strong downward momentum: ${(momentum * 100).toFixed(2)}%`;
      }

      return signal;
    } catch (error) {
      console.error('Momentum strategy error:', error.message);
      return null;
    }
  }

  // Dollar Cost Averaging Strategy
  async dcaStrategy(symbol, params = {}) {
    const { interval = 24, amount = 100 } = params; // Buy every 24 hours with $100
    
    try {
      // Check if it's time for DCA purchase
      const lastTrade = await this.getLastTradeForSymbol(symbol);
      const now = new Date();
      
      if (lastTrade) {
        const timeSinceLastTrade = now - new Date(lastTrade.created_at);
        const hoursSinceLastTrade = timeSinceLastTrade / (1000 * 60 * 60);
        
        if (hoursSinceLastTrade < interval) {
          return null; // Not time for DCA yet
        }
      }

      const currentPrice = await marketDataService.getCurrentPrice(symbol);
      if (!currentPrice) return null;

      return {
        type: 'buy',
        confidence: 0.8, // DCA has consistent confidence
        price: currentPrice.price,
        reason: `DCA Purchase - ${interval}h interval`,
        technical_indicators: {
          dca_amount: amount,
          dca_interval: interval,
          current_price: currentPrice.price
        }
      };
    } catch (error) {
      console.error('DCA strategy error:', error.message);
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
