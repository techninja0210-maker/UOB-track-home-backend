const express = require('express');
const router = express.Router();
const GoldSecurity = require('../models/GoldSecurity');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { query } = require('../config/database');

// ============================================
// GOLD SECURITIES MANAGEMENT
// ============================================

// Get all gold securities (admin)
router.get('/securities', async (req, res) => {
  try {
    const securities = await GoldSecurity.findAll();
    const stats = await GoldSecurity.getStatistics();

    res.json({
      securities,
      statistics: stats
    });
  } catch (error) {
    console.error('Get securities error:', error);
    res.status(500).json({ message: 'Failed to fetch securities' });
  }
});

// Update gold price
router.put('/securities/:id/price', async (req, res) => {
  try {
    const { pricePerGram, reason } = req.body;

    if (!pricePerGram || pricePerGram <= 0) {
      return res.status(400).json({ message: 'Valid price per gram is required' });
    }

    const updated = await GoldSecurity.updatePrice(
      req.params.id,
      pricePerGram,
      req.user.id,
      reason
    );

    res.json({
      message: 'Gold price updated successfully',
      security: updated
    });
  } catch (error) {
    console.error('Update price error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get price history
router.get('/securities/:id/price-history', async (req, res) => {
  try {
    const history = await GoldSecurity.getPriceHistory(req.params.id);
    res.json(history);
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({ message: 'Failed to fetch price history' });
  }
});

// ============================================
// USER WALLETS MANAGEMENT
// ============================================

// Get all user wallets
router.get('/wallets', async (req, res) => {
  try {
    const wallets = await Wallet.findAll();
    res.json(wallets);
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ message: 'Failed to fetch wallets' });
  }
});

// ============================================
// DEPOSIT REQUESTS MANAGEMENT
// ============================================

// Get all deposit requests
router.get('/deposits', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT dr.*, u.email, u.full_name
      FROM deposit_requests dr
      JOIN users u ON dr.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND dr.status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY dr.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ message: 'Failed to fetch deposits' });
  }
});

// Approve deposit
router.post('/deposits/:id/approve', async (req, res) => {
  try {
    const { transactionHash } = req.body;

    // Get deposit request
    const depositResult = await query(
      'SELECT * FROM deposit_requests WHERE id = $1',
      [req.params.id]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ message: 'Deposit request not found' });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit already processed' });
    }

    // Update deposit status
    await query(
      `UPDATE deposit_requests 
       SET status = 'completed', admin_verified = true, admin_id = $1, 
           transaction_hash = $2, completed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, transactionHash, req.params.id]
    );

    // Add to user wallet
    const currencyColumn = `${deposit.currency.toLowerCase()}_balance`;
    await query(
      `UPDATE wallets 
       SET ${currencyColumn} = ${currencyColumn} + $1
       WHERE user_id = $2`,
      [deposit.amount, deposit.user_id]
    );

    // Create transaction record
    await query(
      `INSERT INTO transactions (
        user_id, type, to_currency, to_amount, status, transaction_hash, 
        admin_id, completed_at
      ) VALUES ($1, 'deposit', $2, $3, 'completed', $4, $5, CURRENT_TIMESTAMP)`,
      [deposit.user_id, deposit.currency, deposit.amount, transactionHash, req.user.id]
    );

    res.json({ message: 'Deposit approved successfully' });
  } catch (error) {
    console.error('Approve deposit error:', error);
    res.status(500).json({ message: 'Failed to approve deposit' });
  }
});

// ============================================
// WITHDRAWAL REQUESTS MANAGEMENT
// ============================================

// Get all withdrawal requests
router.get('/withdrawals', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT wr.*, u.email, u.full_name
      FROM withdrawal_requests wr
      JOIN users u ON wr.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND wr.status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY wr.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals' });
  }
});

// Approve withdrawal
router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const { transactionHash } = req.body;

    // Get withdrawal request
    const withdrawalResult = await query(
      'SELECT * FROM withdrawal_requests WHERE id = $1',
      [req.params.id]
    );

    if (withdrawalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal already processed' });
    }

    // Update withdrawal status
    await query(
      `UPDATE withdrawal_requests 
       SET status = 'completed', admin_approved = true, admin_id = $1,
           transaction_hash = $2, approved_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, transactionHash, req.params.id]
    );

    // Deduct from user wallet (already deducted when request created)
    // Just create transaction record
    await query(
      `INSERT INTO transactions (
        user_id, type, from_currency, from_amount, status, transaction_hash,
        admin_id, completed_at
      ) VALUES ($1, 'withdrawal', $2, $3, 'completed', $4, $5, CURRENT_TIMESTAMP)`,
      [withdrawal.user_id, withdrawal.currency, withdrawal.amount, transactionHash, req.user.id]
    );

    res.json({ message: 'Withdrawal approved successfully' });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ message: 'Failed to approve withdrawal' });
  }
});

// Reject withdrawal
router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;

    // Get withdrawal request
    const withdrawalResult = await query(
      'SELECT * FROM withdrawal_requests WHERE id = $1',
      [req.params.id]
    );

    if (withdrawalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    const withdrawal = withdrawalResult.rows[0];

    // Refund amount to user wallet
    const currencyColumn = `${withdrawal.currency.toLowerCase()}_balance`;
    await query(
      `UPDATE wallets 
       SET ${currencyColumn} = ${currencyColumn} + $1
       WHERE user_id = $2`,
      [withdrawal.amount, withdrawal.user_id]
    );

    // Update withdrawal status
    await query(
      `UPDATE withdrawal_requests 
       SET status = 'rejected', admin_id = $1, rejection_reason = $2
       WHERE id = $3`,
      [req.user.id, reason, req.params.id]
    );

    res.json({ message: 'Withdrawal rejected and funds refunded' });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ message: 'Failed to reject withdrawal' });
  }
});

// ============================================
// TRANSACTIONS OVERVIEW
// ============================================

// Get all transactions
router.get('/transactions', async (req, res) => {
  try {
    const { type, status } = req.query;
    const transactions = await Transaction.findAll({ type, status });
    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// Get transaction statistics
router.get('/statistics', async (req, res) => {
  try {
    const txStats = await Transaction.getStatistics();
    const goldStats = await GoldSecurity.getStatistics();
    
    // Get total platform value
    const platformValue = await query(`
      SELECT 
        SUM(btc_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'BTC')) +
        SUM(usdt_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'USDT')) +
        SUM(eth_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'ETH'))
        as total_crypto_locked
      FROM wallets
    `);

    res.json({
      transactions: txStats,
      gold: goldStats,
      platformValue: {
        totalCryptoLocked: parseFloat(platformValue.rows[0].total_crypto_locked || 0)
      }
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// ============================================
// PLATFORM SETTINGS
// ============================================

// Get platform settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query('SELECT * FROM platform_settings ORDER BY setting_key');
    res.json(result.rows);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// Update platform setting
router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;

    const result = await query(
      `UPDATE platform_settings 
       SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $3
       RETURNING *`,
      [value, req.user.id, req.params.key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ message: 'Failed to update setting' });
  }
});

module.exports = router;


