const { query } = require('../config/database');

class RiskManagementService {
  constructor() {
    this.defaultLimits = {
      maxPositionSizePercent: 10,    // Max 10% of portfolio per position
      stopLossPercent: 2,            // 2% stop loss
      takeProfitPercent: 4,          // 4% take profit
      dailyLossLimitPercent: 5,      // Max 5% daily loss
      maxOpenPositions: 3,           // Max 3 open positions
      maxDailyTrades: 10,            // Max 10 trades per day
      minSignalConfidence: 0.6       // Min 60% confidence for trades
    };
  }

  // Check if trade is allowed based on risk limits
  async isTradeAllowed(botId, symbol, side, quantity, price) {
    try {
      const bot = await this.getBotRiskSettings(botId);
      if (!bot) return { allowed: false, reason: 'Bot not found' };

      const checks = await Promise.all([
        this.checkPositionSize(bot, quantity, price),
        this.checkDailyLossLimit(bot, botId),
        this.checkOpenPositions(bot, botId),
        this.checkDailyTradeLimit(bot, botId),
        this.checkStopLoss(bot, symbol, side, quantity, price)
      ]);

      const failedChecks = checks.filter(check => !check.allowed);
      
      if (failedChecks.length > 0) {
        return {
          allowed: false,
          reason: failedChecks.map(check => check.reason).join('; ')
        };
      }

      return { allowed: true, reason: 'All risk checks passed' };
    } catch (error) {
      console.error('Risk management check error:', error.message);
      return { allowed: false, reason: 'Risk check failed' };
    }
  }

  // Check position size limit
  async checkPositionSize(bot, quantity, price) {
    try {
      const positionValue = quantity * price;
      const portfolioValue = await this.getPortfolioValue(bot.user_id);
      
      if (portfolioValue <= 0) {
        return { allowed: false, reason: 'No portfolio value' };
      }

      const positionSizePercent = (positionValue / portfolioValue) * 100;
      const maxPositionSize = bot.risk_settings.max_position_size_percent;

      if (positionSizePercent > maxPositionSize) {
        return {
          allowed: false,
          reason: `Position size ${positionSizePercent.toFixed(2)}% exceeds limit ${maxPositionSize}%`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Position size check error:', error.message);
      return { allowed: false, reason: 'Position size check failed' };
    }
  }

  // Check daily loss limit
  async checkDailyLossLimit(bot, botId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyPnl = await this.getDailyPnl(botId, today);
      const portfolioValue = await this.getPortfolioValue(bot.user_id);
      
      if (portfolioValue <= 0) {
        return { allowed: true }; // No portfolio, allow trade
      }

      const dailyLossPercent = Math.abs(Math.min(0, dailyPnl)) / portfolioValue * 100;
      const maxDailyLoss = bot.risk_settings.daily_loss_limit_percent;

      if (dailyLossPercent >= maxDailyLoss) {
        return {
          allowed: false,
          reason: `Daily loss ${dailyLossPercent.toFixed(2)}% exceeds limit ${maxDailyLoss}%`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Daily loss check error:', error.message);
      return { allowed: false, reason: 'Daily loss check failed' };
    }
  }

  // Check open positions limit
  async checkOpenPositions(bot, botId) {
    try {
      const openPositions = await this.getOpenPositions(botId);
      const maxOpenPositions = bot.risk_settings.max_open_positions;

      if (openPositions >= maxOpenPositions) {
        return {
          allowed: false,
          reason: `Open positions ${openPositions} exceeds limit ${maxOpenPositions}`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Open positions check error:', error.message);
      return { allowed: false, reason: 'Open positions check failed' };
    }
  }

  // Check daily trade limit
  async checkDailyTradeLimit(bot, botId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyTrades = await this.getDailyTradeCount(botId, today);
      const maxDailyTrades = bot.risk_settings.max_daily_trades || 10;

      if (dailyTrades >= maxDailyTrades) {
        return {
          allowed: false,
          reason: `Daily trades ${dailyTrades} exceeds limit ${maxDailyTrades}`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Daily trade check error:', error.message);
      return { allowed: false, reason: 'Daily trade check failed' };
    }
  }

  // Check stop loss for existing positions
  async checkStopLoss(bot, symbol, side, quantity, price) {
    try {
      if (side !== 'sell') return { allowed: true };

      const openPositions = await this.getOpenPositionsForSymbol(bot.id, symbol);
      
      for (const position of openPositions) {
        const stopLossPrice = position.price * (1 - bot.risk_settings.stop_loss_percent / 100);
        
        if (price <= stopLossPrice) {
          return {
            allowed: true,
            reason: 'Stop loss triggered',
            stopLoss: true,
            positionId: position.id
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Stop loss check error:', error.message);
      return { allowed: false, reason: 'Stop loss check failed' };
    }
  }

  // Calculate position size based on risk
  calculatePositionSize(bot, signal, portfolioValue) {
    try {
      const riskAmount = portfolioValue * (bot.risk_settings.max_position_size_percent / 100);
      const stopLossDistance = signal.price * (bot.risk_settings.stop_loss_percent / 100);
      
      // Position size = Risk amount / Stop loss distance
      const positionSize = riskAmount / stopLossDistance;
      
      return Math.min(positionSize, portfolioValue / signal.price);
    } catch (error) {
      console.error('Position size calculation error:', error.message);
      return 0;
    }
  }

  // Calculate stop loss and take profit prices
  calculateStopLossAndTakeProfit(entryPrice, side, riskSettings) {
    const stopLossPercent = riskSettings.stop_loss_percent / 100;
    const takeProfitPercent = riskSettings.take_profit_percent / 100;

    if (side === 'buy') {
      return {
        stopLoss: entryPrice * (1 - stopLossPercent),
        takeProfit: entryPrice * (1 + takeProfitPercent)
      };
    } else {
      return {
        stopLoss: entryPrice * (1 + stopLossPercent),
        takeProfit: entryPrice * (1 - takeProfitPercent)
      };
    }
  }

  // Get bot risk settings
  async getBotRiskSettings(botId) {
    try {
      const result = await query(`
        SELECT id, user_id, risk_settings, strategy_params
        FROM trading_bots 
        WHERE id = $1
      `, [botId]);
      
      if (result.rows.length === 0) return null;
      
      const bot = result.rows[0];
      bot.risk_settings = {
        ...this.defaultLimits,
        ...bot.risk_settings
      };
      
      return bot;
    } catch (error) {
      console.error('Error getting bot risk settings:', error.message);
      return null;
    }
  }

  // Get portfolio value
  async getPortfolioValue(userId) {
    try {
      const result = await query(`
        SELECT 
          COALESCE(btc_balance, 0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'BTC') +
          COALESCE(eth_balance, 0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'ETH') +
          COALESCE(usdt_balance, 0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'USDT') as total_value
        FROM wallets 
        WHERE user_id = $1
      `, [userId]);
      
      return result.rows[0]?.total_value || 0;
    } catch (error) {
      console.error('Error getting portfolio value:', error.message);
      return 0;
    }
  }

  // Get daily PnL
  async getDailyPnl(botId, date) {
    try {
      const result = await query(`
        SELECT COALESCE(SUM(pnl), 0) as daily_pnl
        FROM bot_trades 
        WHERE bot_id = $1 
        AND DATE(created_at) = $2
        AND status = 'filled'
      `, [botId, date]);
      
      return parseFloat(result.rows[0]?.daily_pnl || 0);
    } catch (error) {
      console.error('Error getting daily PnL:', error.message);
      return 0;
    }
  }

  // Get open positions count
  async getOpenPositions(botId) {
    try {
      const result = await query(`
        SELECT COUNT(*) as open_positions
        FROM bot_trades 
        WHERE bot_id = $1 
        AND status = 'filled'
        AND pnl = 0
      `, [botId]);
      
      return parseInt(result.rows[0]?.open_positions || 0);
    } catch (error) {
      console.error('Error getting open positions:', error.message);
      return 0;
    }
  }

  // Get open positions for a specific symbol
  async getOpenPositionsForSymbol(botId, symbol) {
    try {
      const result = await query(`
        SELECT id, symbol, side, quantity, price, pnl
        FROM bot_trades 
        WHERE bot_id = $1 
        AND symbol = $2
        AND status = 'filled'
        AND pnl = 0
      `, [botId, symbol]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting open positions for symbol:', error.message);
      return [];
    }
  }

  // Get daily trade count
  async getDailyTradeCount(botId, date) {
    try {
      const result = await query(`
        SELECT COUNT(*) as trade_count
        FROM bot_trades 
        WHERE bot_id = $1 
        AND DATE(created_at) = $2
      `, [botId, date]);
      
      return parseInt(result.rows[0]?.trade_count || 0);
    } catch (error) {
      console.error('Error getting daily trade count:', error.message);
      return 0;
    }
  }

  // Update risk limits
  async updateRiskLimits(botId, newLimits) {
    try {
      const result = await query(`
        UPDATE trading_bots 
        SET risk_settings = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING risk_settings
      `, [JSON.stringify(newLimits), botId]);
      
      return result.rows[0]?.risk_settings;
    } catch (error) {
      console.error('Error updating risk limits:', error.message);
      return null;
    }
  }

  // Emergency stop all bots for a user
  async emergencyStopUserBots(userId) {
    try {
      await query(`
        UPDATE trading_bots 
        SET status = 'stopped', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'running'
      `, [userId]);
      
      console.log(`Emergency stop triggered for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error in emergency stop:', error.message);
      return false;
    }
  }
}

module.exports = new RiskManagementService();
