const { query, transaction } = require('../config/database');

class Wallet {
  // Get or create wallet for user
  static async getOrCreate(userId) {
    let wallet = await this.findByUserId(userId);
    
    if (!wallet) {
      wallet = await this.create(userId);
    }
    
    return wallet;
  }

  // Find wallet by user ID
  static async findByUserId(userId) {
    const result = await query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  // Create new wallet (unique addresses per user, but transactions go to pool)
  static async create(userId) {
    const poolWalletService = require('../services/poolWalletService');
    
    // Get unique addresses for this user
    const btcAddress = await poolWalletService.getUserDepositAddress(userId, 'BTC');
    const ethAddress = await poolWalletService.getUserDepositAddress(userId, 'ETH');
    const usdtAddress = await poolWalletService.getUserDepositAddress(userId, 'USDT');
    
    const result = await query(
      `INSERT INTO wallets (
        user_id, 
        btc_balance, usdt_balance, eth_balance,
        btc_address, eth_address, usdt_address
      )
      VALUES ($1, 0, 0, 0, $2, $3, $4)
      RETURNING *`,
      [
        userId,
        btcAddress, // Unique addresses per user
        ethAddress,
        usdtAddress
      ]
    );
    return result.rows[0];
  }

  // Update balance
  static async updateBalance(userId, currency, amount, operation = 'add') {
    const currencyColumn = `${currency.toLowerCase()}_balance`;
    const operator = operation === 'add' ? '+' : '-';
    
    const result = await query(
      `UPDATE wallets 
       SET ${currencyColumn} = ${currencyColumn} ${operator} $1
       WHERE user_id = $2
       RETURNING *`,
      [Math.abs(amount), userId]
    );
    
    return result.rows[0];
  }

  // Get wallet with current USD value
  static async getWithValue(userId) {
    const result = await query(
      `SELECT 
        w.*,
        (w.btc_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'BTC')) as btc_value_usd,
        (w.usdt_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'USDT')) as usdt_value_usd,
        (w.eth_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'ETH')) as eth_value_usd,
        (
          (w.btc_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'BTC')) +
          (w.usdt_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'USDT')) +
          (w.eth_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'ETH'))
        ) as total_value_usd
       FROM wallets w
       WHERE w.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  // Get all wallets (admin)
  static async findAll() {
    const result = await query(`
      SELECT * FROM user_portfolios
      ORDER BY total_crypto_value_usd + total_gold_value_usd DESC
    `);
    return result.rows;
  }
}

module.exports = Wallet;


