const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const poolWithdrawalService = require('../services/poolWithdrawalService');
const poolBlockchainMonitor = require('../services/poolBlockchainMonitor');
const poolWalletService = require('../services/poolWalletService');
const auth = require('./auth'); // For admin middleware

// Get pool wallet balances (Admin only)
router.get('/balances', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const balances = await poolWalletService.getPoolBalances();
    res.json(balances);
  } catch (error) {
    console.error('Get pool balances error:', error);
    res.status(500).json({ message: 'Failed to fetch pool balances' });
  }
});

// Get pending pool deposits (Admin only)
router.get('/deposits/pending', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const deposits = await poolBlockchainMonitor.getPendingPoolDeposits();
    res.json(deposits);
  } catch (error) {
    console.error('Get pending deposits error:', error);
    res.status(500).json({ message: 'Failed to fetch pending deposits' });
  }
});

// Claim pool deposit for a user (Admin only)
router.post('/deposits/:depositId/claim', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const result = await poolBlockchainMonitor.claimPoolDeposit(depositId, userId);
    res.json(result);
  } catch (error) {
    console.error('Claim deposit error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get pending withdrawals (Admin only)
router.get('/withdrawals/pending', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const withdrawals = await poolWithdrawalService.getPendingWithdrawals();
    res.json(withdrawals);
  } catch (error) {
    console.error('Get pending withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch pending withdrawals' });
  }
});

// Approve withdrawal (Admin only)
router.post('/withdrawals/:withdrawalId/approve', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const adminUserId = req.user.id;

    const result = await poolWithdrawalService.approveWithdrawal(withdrawalId, adminUserId);
    res.json(result);
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Reject withdrawal (Admin only)
router.post('/withdrawals/:withdrawalId/reject', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user.id;

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const result = await poolWithdrawalService.rejectWithdrawal(withdrawalId, adminUserId, reason);
    res.json(result);
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get all withdrawals (Admin only)
router.get('/withdrawals', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const withdrawals = await poolWithdrawalService.getAllWithdrawals();
    res.json(withdrawals);
  } catch (error) {
    console.error('Get all withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals' });
  }
});

// Get pool wallet configuration (Admin only)
router.get('/config', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const addresses = await poolWalletService.getPoolAddresses();
    
    const result = await query(
      `SELECT currency, pool_address, is_active, created_at, updated_at 
       FROM pool_wallet_config 
       ORDER BY currency`
    );

    res.json({
      addresses,
      config: result.rows
    });
  } catch (error) {
    console.error('Get pool config error:', error);
    res.status(500).json({ message: 'Failed to fetch pool configuration' });
  }
});

// Update pool wallet configuration (Admin only)
router.put('/config', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const { currency, pool_address, is_active } = req.body;

    if (!currency || !pool_address) {
      return res.status(400).json({ message: 'Currency and pool address are required' });
    }

    const result = await query(
      `UPDATE pool_wallet_config 
       SET pool_address = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
       WHERE currency = $3
       RETURNING *`,
      [pool_address, is_active !== false, currency]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pool wallet configuration not found' });
    }

    res.json({
      message: 'Pool wallet configuration updated successfully',
      config: result.rows[0]
    });
  } catch (error) {
    console.error('Update pool config error:', error);
    res.status(500).json({ message: 'Failed to update pool configuration' });
  }
});

// Get pool wallet statistics (Admin only)
router.get('/stats', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    // Get total users with wallets
    const usersCount = await query('SELECT COUNT(*) FROM wallets');
    
    // Get total pending deposits
    const pendingDeposits = await query(
      `SELECT currency, COUNT(*) as count, SUM(amount) as total_amount 
       FROM pool_deposits 
       WHERE status = 'pending' 
       GROUP BY currency`
    );
    
    // Get total pending withdrawals
    const pendingWithdrawals = await query(
      `SELECT currency, COUNT(*) as count, SUM(amount) as total_amount 
       FROM pool_withdrawals 
       WHERE status = 'pending' 
       GROUP BY currency`
    );
    
    // Get total completed withdrawals (last 24 hours)
    const dailyWithdrawals = await query(
      `SELECT currency, COUNT(*) as count, SUM(amount) as total_amount 
       FROM pool_withdrawals 
       WHERE status = 'completed' 
       AND completed_at >= NOW() - INTERVAL '24 hours'
       GROUP BY currency`
    );

    res.json({
      users: {
        total: parseInt(usersCount.rows[0].count)
      },
      pendingDeposits: pendingDeposits.rows,
      pendingWithdrawals: pendingWithdrawals.rows,
      dailyWithdrawals: dailyWithdrawals.rows
    });
  } catch (error) {
    console.error('Get pool stats error:', error);
    res.status(500).json({ message: 'Failed to fetch pool statistics' });
  }
});

module.exports = router;
