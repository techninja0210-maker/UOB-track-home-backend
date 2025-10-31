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

  // Gold: Advanced Buy Low / Sell High Strategy - Optimized for Profitability
  // Uses multiple technical indicators: Bollinger Bands, RSI, SMA crossovers, support/resistance, volatility
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
        rsiBuy = 40,        // More aggressive: buy when RSI is lower (oversold)
        rsiSell = 60,       // More aggressive: sell when RSI is higher (overbought)
        minTakeProfitPct = 1.2,  // Increased take profit to 1.2%
        stopLossPct = 0.8,       // Increased stop loss to 0.8% (give more room)
        cooldownMinutes = 3,     // Reduced cooldown for more opportunities
        supportLookback = 30,     // Look for support levels
        resistanceLookback = 30   // Look for resistance levels
      } = params;

      // Load more historical data for better analysis (up to 200 points)
      const result = await query(`
        SELECT price_per_gram_usd, created_at
        FROM gold_price_history
        ORDER BY created_at DESC
        LIMIT $1
      `, [Math.max(longPeriod + 50, 200)]);

      let prices = [];
      if (result.rows.length > 0) {
        prices = result.rows
          .map(r => Number(r.price_per_gram_usd))
          .filter(v => Number.isFinite(v))
          .reverse();
      } else {
        // Fallback: get current price and synthesize minimal data
        const curr = await goldPriceService.getCurrentGoldPrice(true);
        if (!curr) return null;
        prices = new Array(longPeriod + 5).fill(curr);
      }

      if (prices.length < longPeriod) return null;

      // Calculate all technical indicators
      const smaShort = marketDataService.calculateSMA(prices, shortPeriod);
      const smaLong = marketDataService.calculateSMA(prices, longPeriod);
      const bb = marketDataService.calculateBollingerBands(prices, bbPeriod, bbStdDev);
      const rsi = marketDataService.calculateRSI(prices, rsiPeriod);
      const currentPrice = prices[prices.length - 1];
      
      // Calculate support and resistance levels
      const recentPrices = prices.slice(-supportLookback);
      const supportLevel = Math.min(...recentPrices);
      const resistanceLevel = Math.max(...recentPrices);
      
      // Calculate volatility (standard deviation of recent prices)
      const volatility = recentPrices.length > 1 
        ? Math.sqrt(recentPrices.reduce((sum, p) => sum + Math.pow(p - smaShort, 2), 0) / recentPrices.length)
        : 0;
      const volatilityPct = smaShort > 0 ? (volatility / smaShort) * 100 : 0;

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
          current_price: currentPrice,
          support: supportLevel,
          resistance: resistanceLevel,
          volatility_pct: volatilityPct
        }
      };

      // Check cooldown to avoid overtrading
      try {
        const lastTrade = await this.getLastTradeForSymbol('XAUUSD');
        if (lastTrade && lastTrade.created_at) {
          const lastTs = new Date(lastTrade.created_at).getTime();
          const minutesSince = (Date.now() - lastTs) / (60 * 1000);
          if (minutesSince < cooldownMinutes) {
            signal.reason = `Cooldown active (${(cooldownMinutes - minutesSince).toFixed(1)}m remaining)`;
            return signal;
          }
        }
      } catch (_) {}

      // Check if we have an open position
      let hasOpenPosition = false;
      let entryPrice = null;
      try {
        const lastTrade = await this.getLastTradeForSymbol('XAUUSD');
        if (lastTrade && lastTrade.side === 'buy' && lastTrade.status === 'filled') {
          // Check if there's a corresponding sell (if not, position is open)
          const sellCheck = await query(`
            SELECT id FROM bot_trades 
            WHERE symbol = $1 AND side = 'sell' AND created_at > $2
            ORDER BY created_at DESC LIMIT 1
          `, ['XAUUSD', lastTrade.created_at]);
          
          if (sellCheck.rows.length === 0) {
            hasOpenPosition = true;
            entryPrice = Number(lastTrade.price) || currentPrice;
          }
        }
      } catch (_) {}

      // Calculate trend strength
      const upTrend = smaShort && smaLong ? smaShort >= smaLong : false;
      const trendStrength = smaShort && smaLong ? Math.abs((smaShort - smaLong) / smaLong) * 100 : 0;
      
      // Calculate momentum (recent price change)
      const momentum3 = prices.length >= 4 ? ((prices[prices.length - 1] - prices[prices.length - 4]) / prices[prices.length - 4]) * 100 : 0;
      const momentum1 = prices.length >= 2 ? ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100 : 0;
      const momentumUp = momentum3 > 0 && momentum1 > 0;

      // BUY SIGNALS - Multiple conditions for high-confidence buys
      if (!hasOpenPosition && bb && rsi !== null) {
        // Signal 1: Strong buy - Price touches lower Bollinger Band + RSI oversold + price near support
        const nearLowerBand = currentPrice <= bb.lower * 1.005; // Within 0.5% of lower band
        const nearSupport = currentPrice <= supportLevel * 1.003; // Within 0.3% of support
        const rsiOversold = rsi <= rsiBuy;
        
        if (nearLowerBand && rsiOversold && nearSupport) {
          signal.type = 'buy';
          const discount = ((bb.middle - currentPrice) / bb.middle) * 100;
          signal.confidence = Math.min(0.95, 0.65 + (discount / 2));
          signal.reason = `Strong buy: Lower BB + Support + RSI ${rsi.toFixed(1)} (${discount.toFixed(2)}% below middle)`;
          return signal;
        }

        // Signal 2: Trend-following buy - Upward trend + RSI recovering from oversold
        if (upTrend && trendStrength > 0.3 && rsi > 35 && rsi < 50 && momentumUp) {
          signal.type = 'buy';
          signal.confidence = Math.min(0.85, 0.6 + (trendStrength / 10));
          signal.reason = `Trend buy: Uptrend ${trendStrength.toFixed(2)}% + RSI ${rsi.toFixed(1)} + Momentum`;
          return signal;
        }

        // Signal 3: Mean reversion buy - Price significantly below SMA20 + low RSI
        if (smaShort && currentPrice < smaShort * 0.995 && rsi <= 42) {
          const discount = ((smaShort - currentPrice) / smaShort) * 100;
          signal.type = 'buy';
          signal.confidence = Math.min(0.8, 0.55 + (discount / 3));
          signal.reason = `Mean reversion buy: ${discount.toFixed(2)}% below SMA20, RSI ${rsi.toFixed(1)}`;
          return signal;
        }
      }

      // SELL SIGNALS - Multiple conditions for high-confidence sells
      if (hasOpenPosition && entryPrice && bb && rsi !== null) {
        const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const drawdownPct = ((entryPrice - currentPrice) / entryPrice) * 100;

        // Signal 1: Take profit - Price reached target profit level
        if (pnlPct >= minTakeProfitPct) {
          signal.type = 'sell';
          signal.confidence = Math.min(0.95, 0.7 + (pnlPct / 5));
          signal.reason = `Take profit: +${pnlPct.toFixed(2)}% profit (entry: $${entryPrice.toFixed(2)})`;
          return signal;
        }

        // Signal 2: Stop loss - Price dropped below stop loss level
        if (drawdownPct >= stopLossPct) {
          signal.type = 'sell';
          signal.confidence = 0.9;
          signal.reason = `Stop loss: -${drawdownPct.toFixed(2)}% loss (entry: $${entryPrice.toFixed(2)})`;
          return signal;
        }

        // Signal 3: Resistance/Upper band sell - Price hits upper Bollinger Band + RSI overbought
        const nearUpperBand = currentPrice >= bb.upper * 0.995; // Within 0.5% of upper band
        const nearResistance = currentPrice >= resistanceLevel * 0.997; // Within 0.3% of resistance
        const rsiOverbought = rsi >= rsiSell;
        
        if (nearUpperBand && rsiOverbought && pnlPct > 0.5) {
          signal.type = 'sell';
          signal.confidence = Math.min(0.9, 0.7 + (pnlPct / 3));
          signal.reason = `Resistance sell: Upper BB + RSI ${rsi.toFixed(1)} + ${pnlPct.toFixed(2)}% profit`;
          return signal;
        }

        // Signal 4: Trend reversal sell - Trend turns down + profit exists
        if (!upTrend && trendStrength > 0.2 && pnlPct > 0.3 && momentum1 < -0.1) {
          signal.type = 'sell';
          signal.confidence = Math.min(0.85, 0.65 + (pnlPct / 4));
          signal.reason = `Trend reversal: Downtrend + ${pnlPct.toFixed(2)}% profit secured`;
          return signal;
        }
      }

      // If no position and price is very high, consider selling (if we somehow have a position)
      if (!hasOpenPosition && bb && rsi !== null) {
        const nearUpperBand = currentPrice >= bb.upper * 0.998;
        const rsiOverbought = rsi >= 65;
        if (nearUpperBand && rsiOverbought) {
          // This shouldn't happen but handle edge case
          signal.reason = `Price high but no position: Upper BB + RSI ${rsi.toFixed(1)}`;
        }
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
