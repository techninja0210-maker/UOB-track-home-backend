const express = require('express');
const router = express.Router();
const withdrawalService = require('../services/withdrawalService');

// Get all pending withdrawals
router.get('/pending', async (req, res) => {
  try {
    const withdrawals = await withdrawalService.getPendingWithdrawals();
    res.json(withdrawals);
  } catch (error) {
    console.error('Get pending withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch pending withdrawals' });
  }
});

// Approve withdrawal
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await withdrawalService.approveWithdrawal(id, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Reject withdrawal
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }
    
    const result = await withdrawalService.rejectWithdrawal(id, req.user.id, reason);
    res.json(result);
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get all withdrawals (with filters)
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const { query } = require('../config/database');
    
    let sql = `
      SELECT w.*, u.full_name, u.email 
      FROM withdrawal_requests w
      JOIN users u ON w.user_id = u.id
    `;
    
    const params = [];
    
    if (status) {
      sql += ' WHERE w.status = $1';
      params.push(status);
    }
    
    sql += ' ORDER BY w.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals' });
  }
});

module.exports = router;

