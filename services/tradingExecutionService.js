const axios = require('axios');
const { query } = require('../config/database');
const crypto = require('crypto');

class TradingExecutionService {
  constructor() {
    this.exchanges = {
      binance: this.binanceTrade.bind(this),
      bybit: this.bybitTrade.bind(this),
      coinbase: this.coinbaseTrade.bind(this),
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

      const exchangeAccount = await this.getExchangeAccount(bot.user_id, exchange);
      if (!exchangeAccount && exchange !== 'paper') {
        throw new Error('Exchange account not found');
      }

      const tradeData = {
        botId,
        symbol,
        side,
        quantity,
        price,
        exchange,
        isTestnet: bot.is_paper_trading || exchange === 'paper'
      };

      // Execute trade on selected exchange
      const result = await this.exchanges[exchange](tradeData, exchangeAccount);
      
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

  // Binance trading
  async binanceTrade(tradeData, exchangeAccount) {
    try {
      const { symbol, side, quantity, price, isTestnet } = tradeData;
      
      const baseUrl = isTestnet 
        ? 'https://testnet.binance.vision'
        : 'https://api.binance.com';

      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&side=${side.toUpperCase()}&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price}&timestamp=${timestamp}`;
      
      const signature = crypto
        .createHmac('sha256', exchangeAccount.api_secret_encrypted)
        .update(queryString)
        .digest('hex');

      const response = await axios.post(`${baseUrl}/api/v3/order`, null, {
        params: {
          symbol,
          side: side.toUpperCase(),
          type: 'LIMIT',
          timeInForce: 'GTC',
          quantity,
          price,
          timestamp,
          signature
        },
        headers: {
          'X-MBX-APIKEY': exchangeAccount.api_key_encrypted
        },
        timeout: 10000
      });

      return {
        orderId: response.data.orderId.toString(),
        status: response.data.status.toLowerCase(),
        executedPrice: parseFloat(response.data.price),
        executedQuantity: parseFloat(response.data.executedQty),
        fee: parseFloat(response.data.fills?.[0]?.commission || 0)
      };
    } catch (error) {
      console.error('Binance trade error:', error.response?.data || error.message);
      throw new Error(`Binance trade failed: ${error.response?.data?.msg || error.message}`);
    }
  }

  // Bybit trading
  async bybitTrade(tradeData, exchangeAccount) {
    try {
      const { symbol, side, quantity, price, isTestnet } = tradeData;
      
      const baseUrl = isTestnet 
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

      const timestamp = Date.now();
      const params = {
        symbol,
        side: side.toUpperCase(),
        order_type: 'Limit',
        qty: quantity,
        price,
        time_in_force: 'GTC',
        api_key: exchangeAccount.api_key_encrypted,
        timestamp: timestamp
      };

      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');

      const signature = crypto
        .createHmac('sha256', exchangeAccount.api_secret_encrypted)
        .update(queryString)
        .digest('hex');

      const response = await axios.post(`${baseUrl}/v2/private/order/create`, {
        ...params,
        sign: signature
      }, {
        timeout: 10000
      });

      if (response.data.ret_code !== 0) {
        throw new Error(response.data.ret_msg);
      }

      return {
        orderId: response.data.result.order_id,
        status: 'filled', // Bybit doesn't return status in create response
        executedPrice: parseFloat(price),
        executedQuantity: parseFloat(quantity),
        fee: 0 // Will be calculated separately
      };
    } catch (error) {
      console.error('Bybit trade error:', error.response?.data || error.message);
      throw new Error(`Bybit trade failed: ${error.response?.data?.ret_msg || error.message}`);
    }
  }

  // Coinbase trading
  async coinbaseTrade(tradeData, exchangeAccount) {
    try {
      const { symbol, side, quantity, price } = tradeData;
      
      const timestamp = Math.floor(Date.now() / 1000);
      const method = 'POST';
      const path = '/orders';
      const body = JSON.stringify({
        product_id: symbol,
        side: side.toLowerCase(),
        order_type: 'limit',
        price: price.toString(),
        size: quantity.toString()
      });

      const message = timestamp + method + path + body;
      const signature = crypto
        .createHmac('sha256', exchangeAccount.api_secret_encrypted)
        .update(message)
        .digest('base64');

      const response = await axios.post('https://api.exchange.coinbase.com/orders', body, {
        headers: {
          'CB-ACCESS-KEY': exchangeAccount.api_key_encrypted,
          'CB-ACCESS-SIGN': signature,
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-ACCESS-PASSPHRASE': exchangeAccount.api_passphrase_encrypted,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return {
        orderId: response.data.id,
        status: response.data.status,
        executedPrice: parseFloat(price),
        executedQuantity: parseFloat(quantity),
        fee: 0 // Will be calculated separately
      };
    } catch (error) {
      console.error('Coinbase trade error:', error.response?.data || error.message);
      throw new Error(`Coinbase trade failed: ${error.response?.data?.message || error.message}`);
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
        SELECT id, user_id, is_paper_trading, exchange
        FROM trading_bots 
        WHERE id = $1
      `, [botId]);
      
      return result.rows[0] || null;
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
