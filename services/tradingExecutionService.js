const { query } = require('../config/database');
const cryptoPriceService = require('./cryptoPriceService');
const goldPriceService = require('./goldPriceService');

class TradingExecutionService {
  constructor() {
    this.exchanges = {
      paper: this.paperTrade.bind(this)
    };
  }

  // Main trade execution method
  async executeTrade(botId, symbol, side, quantity, price, exchange = 'paper') {
    try {
      const bot = await this.getBotInfo(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      const exchangeAccount = null; // Exchanges removed in gold-only system

      const tradeData = {
        botId,
        symbol,
        side,
        quantity,
        price,
        exchange,
        isTestnet: bot.is_paper_trading || exchange === 'paper'
      };

      // If trading gold (XAUUSD) in paper mode, compute crypto settlement details
      if (symbol === 'XAUUSD') {
        try {
          const quoteCurrency = (bot.strategy_params && bot.strategy_params.quoteCurrency) || 'USDT';
          const goldPricePerGram = await goldPriceService.getCurrentGoldPrice();
          const cryptoPrices = await cryptoPriceService.getCurrentPrices();
          const quotePriceUsd = cryptoPrices[quoteCurrency] || cryptoPrices[`${quoteCurrency}`] || 1;
          const usdNotional = (price || goldPricePerGram) * quantity;
          const cryptoAmount = usdNotional / quotePriceUsd;
          tradeData.settlement = { quoteCurrency, usdNotional, cryptoAmount, quotePriceUsd, goldPricePerGram };
        } catch (e) {
          console.log('Gold settlement calc failed:', e.message);
        }
      }

      // Execute trade on selected exchange
      const result = await this.exchanges['paper'](tradeData, exchangeAccount);
      
      // Store trade in database
      const tradeRecord = await this.storeTrade({
        ...tradeData,
        ...result,
        user_id: bot.user_id
      });

      // Update bot statistics
      await this.updateBotStats(botId, result);

      return {
        success: true,
        tradeId: tradeRecord.id,
        orderId: result.orderId,
        status: result.status,
        executedPrice: result.executedPrice,
        executedQuantity: result.executedQuantity,
        fee: result.fee
      };
    } catch (error) {
      console.error('Trade execution error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }


  // Paper trading (simulation)
  async paperTrade(tradeData) {
    try {
      const { symbol, side, quantity, price } = tradeData;
      
      // Simulate some slippage and execution delay
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      
      const slippage = (Math.random() - 0.5) * 0.001; // ±0.1% slippage
      const executedPrice = price * (1 + slippage);
      const fee = executedPrice * quantity * 0.001; // 0.1% fee
      
      return {
        orderId: `PAPER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'filled',
        executedPrice,
        executedQuantity: quantity,
        fee
      };
    } catch (error) {
      console.error('Paper trade error:', error.message);
      throw new Error(`Paper trade failed: ${error.message}`);
    }
  }

  // Get bot information
  async getBotInfo(botId) {
    try {
      const result = await query(`
        SELECT id, user_id, is_paper_trading, exchange, strategy_params
        FROM trading_bots 
        WHERE id = $1
      `, [botId]);
      
      const bot = result.rows[0] || null;
      if (bot && typeof bot.strategy_params === 'string') {
        try { bot.strategy_params = JSON.parse(bot.strategy_params); } catch (_) {}
      }
      return bot;
    } catch (error) {
      console.error('Error getting bot info:', error.message);
      return null;
    }
  }

  // Get exchange account
  async getExchangeAccount(userId, exchange) {
    try {
      const result = await query(`
        SELECT api_key_encrypted, api_secret_encrypted, api_passphrase_encrypted, is_testnet
        FROM exchange_accounts 
        WHERE user_id = $1 AND exchange = $2 AND is_active = true
        ORDER BY last_used_at DESC NULLS LAST
        LIMIT 1
      `, [userId, exchange]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting exchange account:', error.message);
      return null;
    }
  }

  // Store trade in database
  async storeTrade(tradeData) {
    try {
      const {
        botId,
        symbol,
        side,
        quantity,
        price,
        orderId,
        status,
        executedPrice,
        executedQuantity,
        fee,
        user_id
      } = tradeData;

      const result = await query(`
        INSERT INTO bot_trades (
          bot_id, symbol, side, quantity, price, total_value, fee, 
          order_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        botId,
        symbol,
        side,
        executedQuantity || quantity,
        executedPrice || price,
        (executedQuantity || quantity) * (executedPrice || price),
        fee || 0,
        orderId,
        status
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error storing trade:', error.message);
      throw error;
    }
  }

  // Update bot statistics
  async updateBotStats(botId, tradeResult) {
    try {
      const { status, executedPrice, executedQuantity, fee } = tradeResult;
      
      if (status === 'filled') {
        await query(`
          UPDATE trading_bots 
          SET 
            total_trades = total_trades + 1,
            last_run_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [botId]);
      }
    } catch (error) {
      console.error('Error updating bot stats:', error.message);
    }
  }

  // Cancel order
  async cancelOrder(botId, orderId, symbol, exchange = 'paper') {
    try {
      const bot = await this.getBotInfo(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      const exchangeAccount = await this.getExchangeAccount(bot.user_id, exchange);
      
      if (exchange === 'paper') {
        return { success: true, message: 'Paper order cancelled' };
      }

      // Implement exchange-specific cancel logic here
      // This would be similar to the trade execution but for order cancellation
      
      return { success: true, message: 'Order cancelled' };
    } catch (error) {
      console.error('Cancel order error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get order status
  async getOrderStatus(botId, orderId, symbol, exchange = 'paper') {
    try {
      const bot = await this.getBotInfo(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      if (exchange === 'paper') {
        return { status: 'filled', message: 'Paper order status' };
      }

      // Implement exchange-specific status check here
      
      return { status: 'unknown', message: 'Status check not implemented' };
    } catch (error) {
      console.error('Get order status error:', error.message);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new TradingExecutionService();
