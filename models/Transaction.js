const { query } = require('../config/database');

class Transaction {
  // Create new transaction
  static async create(data) {
    const {
      userId,
      type,
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount,
      goldSecurityId = null,
      skrReference = null,
      exchangeRate = null,
      platformFee = 0,
      networkFee = 0,
      status = 'pending',
      transactionHash = null,
      merchantWalletAddress = null,
      ipAddress = null,
      userAgent = null
    } = data;

    const totalFee = parseFloat(platformFee) + parseFloat(networkFee);

    const result = await query(
      `INSERT INTO transactions (
        user_id, type, from_currency, to_currency, from_amount, to_amount,
        gold_security_id, skr_reference, exchange_rate, platform_fee, network_fee, total_fee,
        status, transaction_hash, merchant_wallet_address, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [userId, type, fromCurrency, toCurrency, fromAmount, toAmount, goldSecurityId, skrReference,
       exchangeRate, platformFee, networkFee, totalFee, status, transactionHash, 
       merchantWalletAddress, ipAddress, userAgent]
    );

    return result.rows[0];
  }

  // Update transaction status
  static async updateStatus(id, status, transactionHash = null) {
    const updates = ['status = $1'];
    const params = [status, id];
    let paramCount = 2;

    if (status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (transactionHash) {
      updates.push(`transaction_hash = $${++paramCount}`);
      params.splice(paramCount - 1, 0, transactionHash);
    }

    const result = await query(
      `UPDATE transactions 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    return result.rows[0];
  }

  // Get user transaction history
  static async findByUserId(userId, filters = {}) {
    let sql = `
      SELECT t.*, gs.name as gold_name
      FROM transactions t
      LEFT JOIN gold_securities gs ON t.gold_security_id = gs.id
      WHERE t.user_id = $1
    `;
    const params = [userId];
    let paramCount = 1;

    if (filters.type) {
      sql += ` AND t.type = $${++paramCount}`;
      params.push(filters.type);
    }

    if (filters.status) {
      sql += ` AND t.status = $${++paramCount}`;
      params.push(filters.status);
    }

    if (filters.fromDate) {
      sql += ` AND t.created_at >= $${++paramCount}`;
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      sql += ` AND t.created_at <= $${++paramCount}`;
      params.push(filters.toDate);
    }

    sql += ` ORDER BY t.created_at DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${++paramCount}`;
      params.push(filters.limit);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  // Get all transactions (admin view)
  static async findAll(filters = {}) {
    let sql = `
      SELECT t.*, u.email as user_email, u.full_name, gs.name as gold_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN gold_securities gs ON t.gold_security_id = gs.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.type) {
      sql += ` AND t.type = $${++paramCount}`;
      params.push(filters.type);
    }

    if (filters.status) {
      sql += ` AND t.status = $${++paramCount}`;
      params.push(filters.status);
    }

    if (filters.userId) {
      sql += ` AND t.user_id = $${++paramCount}`;
      params.push(filters.userId);
    }

    sql += ` ORDER BY t.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    return result.rows;
  }

  // Get transaction statistics
  static async getStatistics() {
    const result = await query('SELECT * FROM transaction_statistics');
    return result.rows[0];
  }

  // Get transaction by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM transactions WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Transaction;


