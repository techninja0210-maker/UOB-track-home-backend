const express = require('express');
const router = express.Router();
const botEngineService = require('../services/botEngineService');
const aiStrategyService = require('../services/aiStrategyService');
const riskManagementService = require('../services/riskManagementService');
const tradingExecutionService = require('../services/tradingExecutionService');
const marketDataService = require('../services/marketDataService');
const { query } = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Get all trading bots for user
router.get('/bots', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id, name, strategy_type, status, is_paper_trading, exchange,
        trading_pairs, risk_settings, strategy_params, created_at,
        updated_at, last_run_at, total_trades, winning_trades, total_pnl, daily_pnl
      FROM trading_bots 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      bots: result.rows
    });
  } catch (error) {
    console.error('Error fetching bots:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bots' });
  }
});

// Create new trading bot
router.post('/bots', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      strategy_type,
      trading_pairs = ['BTCUSDT', 'ETHUSDT'],
      risk_settings = {},
      strategy_params = {},
      exchange = 'paper'
    } = req.body;

    if (!name || !strategy_type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bot name and strategy type are required' 
      });
    }

    const result = await query(`
      INSERT INTO trading_bots (
        user_id, name, strategy_type, trading_pairs, risk_settings, 
        strategy_params, exchange, is_paper_trading
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.id,
      name,
      strategy_type,
      JSON.stringify(trading_pairs),
      JSON.stringify(risk_settings),
      JSON.stringify(strategy_params),
      exchange,
      exchange === 'paper'
    ]);

    res.json({
      success: true,
      message: 'Bot created successfully',
      bot: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create bot' });
  }
});

// Update trading bot
router.put('/bots/:botId', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;
    const updates = req.body;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (['name', 'strategy_type', 'trading_pairs', 'risk_settings', 'strategy_params', 'exchange'].includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]);
        paramCount++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(botId);

    const result = await query(`
      UPDATE trading_bots 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    res.json({
      success: true,
      message: 'Bot updated successfully',
      bot: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update bot' });
  }
});

// Delete trading bot
router.delete('/bots/:botId', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    // Stop bot if running
    await botEngineService.stopBot(botId);

    // Delete bot
    await query(`DELETE FROM trading_bots WHERE id = $1`, [botId]);

    res.json({
      success: true,
      message: 'Bot deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete bot' });
  }
});

// Start bot
router.post('/bots/:botId/start', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await botEngineService.startBot(botId);
    res.json(result);
  } catch (error) {
    console.error('Error starting bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to start bot' });
  }
});

// Stop bot
router.post('/bots/:botId/stop', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await botEngineService.stopBot(botId);
    res.json(result);
  } catch (error) {
    console.error('Error stopping bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to stop bot' });
  }
});

// Pause bot
router.post('/bots/:botId/pause', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await botEngineService.pauseBot(botId);
    res.json(result);
  } catch (error) {
    console.error('Error pausing bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to pause bot' });
  }
});

// Resume bot
router.post('/bots/:botId/resume', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await botEngineService.resumeBot(botId);
    res.json(result);
  } catch (error) {
    console.error('Error resuming bot:', error.message);
    res.status(500).json({ success: false, message: 'Failed to resume bot' });
  }
});

// Get bot trades
router.get('/bots/:botId/trades', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await query(`
      SELECT 
        id, symbol, side, quantity, price, total_value, fee,
        order_id, status, signal_strength, strategy_signal,
        created_at, filled_at, pnl
      FROM bot_trades 
      WHERE bot_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [botId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      trades: result.rows
    });
  } catch (error) {
    console.error('Error fetching bot trades:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch trades' });
  }
});

// Get bot activity and real-time status
router.get('/bots/:botId/activity', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id, status, strategy_type, last_run_at FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const bot = botCheck.rows[0];
    
    // Get recent trades for activity (with error handling)
    let recentTrades = [];
    try {
      const tradesResult = await query(`
        SELECT side, symbol, price, created_at, pnl
        FROM bot_trades 
        WHERE bot_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [botId]);
      recentTrades = tradesResult.rows;
    } catch (tradeError) {
      console.log('No trades table or no trades found:', tradeError.message);
      recentTrades = [];
    }

    // Get latest market data (with error handling)
    let marketData = [];
    try {
      // Get trading pairs from the bot first
      const botResult = await query(`
        SELECT trading_pairs FROM trading_bots WHERE id = $1
      `, [botId]);
      
      if (botResult.rows.length > 0) {
        const tradingPairs = botResult.rows[0].trading_pairs || [];
        
        if (tradingPairs.length > 0) {
          // Convert array to string for IN clause
          const pairsString = tradingPairs.map(pair => `'${pair}'`).join(',');
          
          const marketResult = await query(`
            SELECT symbol, current_price_usd as current_price, 0 as price_change_24h, 0 as volume_24h
            FROM crypto_currencies 
            WHERE symbol IN (${pairsString})
            ORDER BY symbol
            LIMIT 10
          `);
          marketData = marketResult.rows;
        }
      }
    } catch (marketError) {
      console.log('No market data found:', marketError.message);
      marketData = [];
    }

    // Generate activity status based on bot state
    let status = 'Stopped';
    let lastSignal = 'No recent activity';
    let marketAnalysis = 'Market data unavailable';

    if (bot.status === 'running') {
      status = 'Active - Monitoring markets';
      
      if (recentTrades.length > 0) {
        const lastTrade = recentTrades[0];
        lastSignal = `${lastTrade.side.toUpperCase()} ${lastTrade.symbol} at $${lastTrade.price}`;
      } else {
        lastSignal = 'Analyzing market conditions...';
      }

      if (marketData.length > 0) {
        const avgChange = marketData.reduce((sum, row) => sum + (row.price_change_24h || 0), 0) / marketData.length;
        marketAnalysis = `Market ${avgChange > 0 ? 'trending up' : 'trending down'} (${avgChange.toFixed(2)}%)`;
      } else {
        marketAnalysis = 'Market analysis in progress...';
      }
    }

    res.json({
      success: true,
      status,
      lastSignal,
      marketAnalysis,
      recentTrades,
      marketData,
      lastRunAt: bot.last_run_at
    });
  } catch (error) {
    console.error('Error fetching bot activity:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bot activity' });
  }
});

// Get bot performance
router.get('/bots/:botId/performance', authenticateToken, async (req, res) => {
  try {
    const { botId } = req.params;
    const { days = 30 } = req.query;

    // Check if bot belongs to user
    const botCheck = await query(`
      SELECT id FROM trading_bots WHERE id = $1 AND user_id = $2
    `, [botId, req.user.id]);

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const result = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_trades,
        COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
        COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_trades,
        SUM(pnl) as daily_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as max_pnl,
        MIN(pnl) as min_pnl
      FROM bot_trades 
      WHERE bot_id = $1 
      AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      AND status = 'filled'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [botId]);

    res.json({
      success: true,
      performance: result.rows
    });
  } catch (error) {
    console.error('Error fetching bot performance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch performance' });
  }
});

// Get market data
router.get('/market-data/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h', limit = 100 } = req.query;

    const data = await marketDataService.getHistoricalData(symbol, timeframe, parseInt(limit));
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching market data:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch market data' });
  }
});

// Get technical indicators
router.get('/indicators/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h' } = req.query;

    const indicators = await marketDataService.getTechnicalIndicators(symbol, timeframe);
    
    res.json({
      success: true,
      indicators
    });
  } catch (error) {
    console.error('Error fetching indicators:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch indicators' });
  }
});

// Get AI signals
router.get('/signals/:symbol', authenticateToken, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    const signals = await aiStrategyService.getRecentSignals(symbol, parseInt(limit));
    
    res.json({
      success: true,
      signals
    });
  } catch (error) {
    console.error('Error fetching signals:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch signals' });
  }
});

// Test strategy
router.post('/test-strategy', authenticateToken, async (req, res) => {
  try {
    const { strategy_type, symbol, params = {} } = req.body;

    if (!strategy_type || !symbol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy type and symbol are required' 
      });
    }

    const signal = await aiStrategyService.executeStrategy(strategy_type, symbol, params);
    
    res.json({
      success: true,
      signal
    });
  } catch (error) {
    console.error('Error testing strategy:', error.message);
    res.status(500).json({ success: false, message: 'Failed to test strategy' });
  }
});

// Get running bots status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const runningBots = botEngineService.getRunningBotsStatus();
    
    res.json({
      success: true,
      runningBots
    });
  } catch (error) {
    console.error('Error fetching status:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

module.exports = router;
