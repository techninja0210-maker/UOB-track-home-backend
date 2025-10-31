const aiStrategyService = require('./aiStrategyService');
const riskManagementService = require('./riskManagementService');
const tradingExecutionService = require('./tradingExecutionService');
const marketDataService = require('./marketDataService');
const { query } = require('../config/database');

class BotEngineService {
  constructor() {
    this.runningBots = new Map();
    this.botIntervals = new Map();
  }

  // Start a trading bot
  async startBot(botId) {
    try {
      const bot = await this.getBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      if (bot.status === 'running') {
        return { success: false, message: 'Bot is already running' };
      }

      // Update bot status
      await this.updateBotStatus(botId, 'running');

      // Create new session
      const session = await this.createBotSession(botId, bot);

      // Start the bot loop
      this.startBotLoop(botId, session.id);

      this.runningBots.set(botId, {
        bot,
        sessionId: session.id,
        startTime: new Date()
      });

      console.log(`🤖 Bot ${botId} started successfully`);
      return { success: true, message: 'Bot started successfully', sessionId: session.id };
    } catch (error) {
      console.error('Error starting bot:', error.message);
      await this.updateBotStatus(botId, 'error');
      return { success: false, message: error.message };
    }
  }

  // Stop a trading bot
  async stopBot(botId) {
    try {
      const bot = this.runningBots.get(botId);
      // Even if not in memory (e.g., after restart), force status to stopped
      if (!bot) {
        await this.updateBotStatus(botId, 'stopped');
        return { success: true, message: 'Bot stopped successfully (no active session)' };
      }

      // Clear the interval
      if (this.botIntervals.has(botId)) {
        clearInterval(this.botIntervals.get(botId));
        this.botIntervals.delete(botId);
      }

      // Update bot status
      await this.updateBotStatus(botId, 'stopped');

      // End the session
      await this.endBotSession(bot.sessionId);

      this.runningBots.delete(botId);

      console.log(`🛑 Bot ${botId} stopped successfully`);
      return { success: true, message: 'Bot stopped successfully' };
    } catch (error) {
      console.error('Error stopping bot:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Pause a trading bot
  async pauseBot(botId) {
    try {
      if (!this.runningBots.has(botId)) {
        // If not running in memory, still mark as paused in DB
        await this.updateBotStatus(botId, 'paused');
        return { success: true, message: 'Bot paused successfully (no active session)' };
      }

      // Clear the interval
      if (this.botIntervals.has(botId)) {
        clearInterval(this.botIntervals.get(botId));
        this.botIntervals.delete(botId);
      }

      // Update bot status
      await this.updateBotStatus(botId, 'paused');

      console.log(`⏸️ Bot ${botId} paused successfully`);
      return { success: true, message: 'Bot paused successfully' };
    } catch (error) {
      console.error('Error pausing bot:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Resume a paused bot
  async resumeBot(botId) {
    try {
      const bot = await this.getBot(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      if (bot.status !== 'paused') {
        return { success: false, message: 'Bot is not paused' };
      }

      // Get the running bot info
      const runningBot = this.runningBots.get(botId);
      if (!runningBot) {
        // Create a lightweight session and start loop again
        const session = await this.createBotSession(botId, bot);
        this.runningBots.set(botId, { bot, sessionId: session.id, startTime: new Date() });
        await this.updateBotStatus(botId, 'running');
        this.startBotLoop(botId, session.id);
        return { success: true, message: 'Bot resumed successfully' };
      }

      // Update bot status
      await this.updateBotStatus(botId, 'running');

      // Restart the bot loop
      this.startBotLoop(botId, runningBot.sessionId);

      console.log(`▶️ Bot ${botId} resumed successfully`);
      return { success: true, message: 'Bot resumed successfully' };
    } catch (error) {
      console.error('Error resuming bot:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Main bot execution loop
  startBotLoop(botId, sessionId) {
    const bot = this.runningBots.get(botId);
    if (!bot) return;

    // Run immediately
    this.executeBotCycle(botId, sessionId);

    // Then run every 60 seconds (gold updates fast, keeps risk manageable)
    const interval = setInterval(() => {
      this.executeBotCycle(botId, sessionId);
    }, 60000);

    this.botIntervals.set(botId, interval);
  }

  // Execute one bot cycle
  async executeBotCycle(botId, sessionId) {
    try {
      const bot = await this.getBot(botId);
      if (!bot || bot.status !== 'running') {
        return;
      }

      console.log(`🔄 Executing bot cycle for ${botId}`);

      // Get trading pairs
      const tradingPairs = bot.trading_pairs || ['BTCUSDT', 'ETHUSDT'];

      // Process each trading pair
      for (const symbol of tradingPairs) {
        try {
          await this.processTradingPair(botId, sessionId, symbol, bot);
        } catch (error) {
          console.error(`Error processing ${symbol} for bot ${botId}:`, error.message);
        }
      }

      // Update last run time
      await this.updateBotLastRun(botId);
    } catch (error) {
      console.error(`Error in bot cycle for ${botId}:`, error.message);
      await this.handleBotError(botId, error.message);
    }
  }

  // Process a single trading pair
  async processTradingPair(botId, sessionId, symbol, bot) {
    try {
      // Get AI signal
      const signal = await aiStrategyService.executeStrategy(
        botId,
        bot.strategy_type,
        symbol,
        bot.strategy_params
      );

      if (!signal || signal.type === 'hold') {
        if (signal && signal.reason) {
          console.log(`📊 ${symbol}: ${signal.reason}`);
        }
        return;
      }

      // Check if signal meets minimum confidence
      const minConfidence = bot.risk_settings?.min_signal_confidence || 0.55;
      if (signal.confidence < minConfidence) {
        console.log(`⚠️ ${symbol}: Signal confidence ${(signal.confidence * 100).toFixed(1)}% below threshold ${(minConfidence * 100).toFixed(1)}% - ${signal.reason}`);
        return;
      }

      console.log(`🎯 ${symbol}: ${signal.type.toUpperCase()} signal (${(signal.confidence * 100).toFixed(1)}% confidence) - ${signal.reason}`);

      // Calculate position size
      const portfolioValue = await riskManagementService.getPortfolioValue(bot.user_id);
      const positionSize = riskManagementService.calculatePositionSize(bot, signal, portfolioValue);

      if (positionSize <= 0) {
        console.log(`Position size too small for ${symbol}`);
        return;
      }

      // Check risk limits
      const riskCheck = await riskManagementService.isTradeAllowed(
        botId,
        symbol,
        signal.type,
        positionSize,
        signal.price
      );

      if (!riskCheck.allowed) {
        console.log(`Trade not allowed for ${symbol}: ${riskCheck.reason}`);
        return;
      }

      // Execute trade
      const tradeResult = await tradingExecutionService.executeTrade(
        botId,
        symbol,
        signal.type,
        positionSize,
        signal.price,
        bot.exchange
      );

      if (tradeResult.success) {
        console.log(`✅ Trade executed for ${symbol}: ${signal.type} ${positionSize} @ ${signal.price}`);
        
        // Store trade with signal info
        await this.storeTradeWithSignal(botId, sessionId, symbol, signal, tradeResult);
      } else {
        console.log(`❌ Trade failed for ${symbol}: ${tradeResult.error}`);
      }
    } catch (error) {
      console.error(`Error processing trading pair ${symbol}:`, error.message);
    }
  }

  // Store trade with signal information
  async storeTradeWithSignal(botId, sessionId, symbol, signal, tradeResult) {
    try {
      await query(`
        UPDATE bot_trades 
        SET 
          session_id = $1,
          signal_strength = $2,
          strategy_signal = $3
        WHERE bot_id = $4 AND order_id = $5
      `, [
        sessionId,
        signal.confidence,
        `${bot.strategy_type}_${signal.type}`,
        botId,
        tradeResult.orderId
      ]);
    } catch (error) {
      console.error('Error storing trade with signal:', error.message);
    }
  }

  // Get bot information
  async getBot(botId) {
    try {
      const result = await query(`
        SELECT * FROM trading_bots WHERE id = $1
      `, [botId]);
      
      if (result.rows.length === 0) return null;
      
      const bot = result.rows[0];
      bot.risk_settings = {
        max_position_size_percent: 10,
        stop_loss_percent: 2,
        take_profit_percent: 4,
        daily_loss_limit_percent: 5,
        max_open_positions: 3,
        min_signal_confidence: 0.55, // Lowered to 0.55 for more trading opportunities
        ...bot.risk_settings
      };
      
      return bot;
    } catch (error) {
      console.error('Error getting bot:', error.message);
      return null;
    }
  }

  // Update bot status
  async updateBotStatus(botId, status) {
    try {
      await query(`
        UPDATE trading_bots 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [status, botId]);
    } catch (error) {
      console.error('Error updating bot status:', error.message);
    }
  }

  // Update bot last run time
  async updateBotLastRun(botId) {
    try {
      await query(`
        UPDATE trading_bots 
        SET last_run_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [botId]);
    } catch (error) {
      console.error('Error updating bot last run:', error.message);
    }
  }

  // Create bot session
  async createBotSession(botId, bot) {
    try {
      const portfolioValue = await riskManagementService.getPortfolioValue(bot.user_id);
      
      const result = await query(`
        INSERT INTO bot_sessions (bot_id, initial_balance)
        VALUES ($1, $2)
        RETURNING *
      `, [botId, portfolioValue]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating bot session:', error.message);
      throw error;
    }
  }

  // End bot session
  async endBotSession(sessionId) {
    try {
      const portfolioValue = await this.getCurrentPortfolioValue(sessionId);
      
      await query(`
        UPDATE bot_sessions 
        SET 
          ended_at = CURRENT_TIMESTAMP,
          status = 'stopped',
          final_balance = $1
        WHERE id = $2
      `, [portfolioValue, sessionId]);
    } catch (error) {
      console.error('Error ending bot session:', error.message);
    }
  }

  // Get current portfolio value for session
  async getCurrentPortfolioValue(sessionId) {
    try {
      const result = await query(`
        SELECT 
          (SELECT user_id FROM trading_bots WHERE id = (SELECT bot_id FROM bot_sessions WHERE id = $1)) as user_id
      `, [sessionId]);
      
      if (result.rows.length === 0) return 0;
      
      const userId = result.rows[0].user_id;
      return await riskManagementService.getPortfolioValue(userId);
    } catch (error) {
      console.error('Error getting current portfolio value:', error.message);
      return 0;
    }
  }

  // Handle bot error
  async handleBotError(botId, errorMessage) {
    try {
      await query(`
        UPDATE trading_bots 
        SET 
          status = 'error',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [botId]);
      
      console.error(`Bot ${botId} encountered error: ${errorMessage}`);
    } catch (error) {
      console.error('Error handling bot error:', error.message);
    }
  }

  // Get running bots status
  getRunningBotsStatus() {
    const status = [];
    for (const [botId, botInfo] of this.runningBots) {
      status.push({
        botId,
        sessionId: botInfo.sessionId,
        startTime: botInfo.startTime,
        uptime: Date.now() - botInfo.startTime.getTime()
      });
    }
    return status;
  }

  // Stop all bots
  async stopAllBots() {
    const botIds = Array.from(this.runningBots.keys());
    const results = [];
    
    for (const botId of botIds) {
      const result = await this.stopBot(botId);
      results.push({ botId, ...result });
    }
    
    return results;
  }

  // Initialize bot engine (start all bots that should be running)
  async initializeBotEngine() {
    try {
      console.log('🤖 Initializing bot engine...');
      
      const result = await query(`
        SELECT id FROM trading_bots 
        WHERE status = 'running'
      `);
      
      for (const row of result.rows) {
        await this.startBot(row.id);
      }
      
      console.log(`✅ Bot engine initialized with ${result.rows.length} running bots`);
    } catch (error) {
      console.error('Error initializing bot engine:', error.message);
    }
  }
}

module.exports = new BotEngineService();
