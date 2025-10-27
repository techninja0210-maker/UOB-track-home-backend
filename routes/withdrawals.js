const express = require('express');
const router = express.Router();
const WithdrawalRequest = require('../models/WithdrawalRequest');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const poolWalletService = require('../services/poolWalletService');
const authRoutes = require('./auth');
const { authenticateToken, requireAdmin } = authRoutes;
const { query } = require('../config/database');

// Get user's withdrawal requests
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const requests = await WithdrawalRequest.findByUserId(
      req.user.id, 
      parseInt(limit), 
      parseInt(offset)
    );

    res.json({
      success: true,
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: requests.length
      }
    });
  } catch (error) {
    console.error('Error fetching user withdrawal requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal requests'
    });
  }
});

// Create new withdrawal request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { currency, amount, destinationAddress } = req.body;

    // Validate input
    if (!currency || !amount || !destinationAddress) {
      return res.status(400).json({
        success: false,
        message: 'Currency, amount, and destination address are required'
      });
    }

    if (!['BTC', 'ETH', 'USDT'].includes(currency)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency. Must be BTC, ETH, or USDT'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Check user's balance from user_balances table (same as frontend)
    const balanceResult = await query(`
      SELECT balance 
      FROM user_balances 
      WHERE user_id = $1 AND currency = $2
    `, [req.user.id, currency]);
    
    const balance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance || 0) : 0;
    
    if (balance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${currency} balance. Available: ${balance}, Requested: ${amount}`
      });
    }

    // Create withdrawal request
    // Deduct amount from user's balance immediately (pending status)
    const userBalanceResult = await query(`
      SELECT balance FROM user_balances 
      WHERE user_id = $1 AND currency = $2
    `, [req.user.id, currency]);
    
    if (userBalanceResult.rows.length > 0) {
      const currentBalance = parseFloat(userBalanceResult.rows[0].balance);
      const newBalance = currentBalance - parseFloat(amount);
      
      if (newBalance >= 0) {
        // Update user's balance
        await query(`
          UPDATE user_balances 
          SET balance = $1, available_balance = $1, updated_at = NOW()
          WHERE user_id = $2 AND currency = $3
        `, [newBalance, req.user.id, currency]);
        
        console.log(`✅ User ${req.user.id} ${currency} balance deducted: ${currentBalance} → ${newBalance}`);
      } else {
        return res.status(400).json({
          success: false,
          message: `Insufficient ${currency} balance. Available: ${currentBalance}, Requested: ${amount}`
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `No ${currency} balance found for user`
      });
    }

    const withdrawalRequest = await WithdrawalRequest.create({
      userId: req.user.id,
      currency,
      amount: parseFloat(amount),
      destinationAddress
    });

    // Log withdrawal request to transactions_ledger for recent activities
    try {
      await query(`
        INSERT INTO transactions_ledger (
          user_id, type, currency, amount, reference_id, meta, created_at
        ) VALUES ($1, 'withdrawal_request', $2, $3, $4, $5, NOW())
      `, [
        req.user.id,
        currency,
        parseFloat(amount),
        withdrawalRequest.id,
        JSON.stringify({
          description: `Withdrawal request for ${amount} ${currency}`,
          status: 'pending',
          destination_address: destinationAddress,
          withdrawal_id: withdrawalRequest.id
        })
      ]);
    } catch (logError) {
      console.error('Error logging withdrawal request:', logError);
      // Don't fail the withdrawal request if logging fails
    }

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: withdrawalRequest
    });
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create withdrawal request'
    });
  }
});

// Get all withdrawal requests (admin only)
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    
    const requests = await WithdrawalRequest.findAll(
      parseInt(limit), 
      parseInt(offset),
      status
    );

    res.json({
      success: true,
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: requests.length
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawal requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal requests'
    });
  }
});

// Get withdrawal statistics (admin only) - MUST be before /admin/:id route
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await WithdrawalRequest.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching withdrawal stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal statistics'
    });
  }
});

// Get withdrawal request by ID (admin only)
router.get('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const request = await WithdrawalRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal request'
    });
  }
});

// Approve withdrawal request (admin only)
router.post('/admin/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const request = await WithdrawalRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal request is not pending'
      });
    }

    // Validate destination address (basic validation)
    if (!request.destinationAddress || request.destinationAddress.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid destination address'
      });
    }

    try {
      // Execute REAL blockchain transaction using existing pool wallet service
      const transactionHash = await poolWalletService.sendFromPool(
        request.currency,
        request.destinationAddress,
        request.amount
      );

      // Update withdrawal request with transaction details
      const updatedRequest = await WithdrawalRequest.updateStatus(
        req.params.id,
        'completed',
        req.user.id,
        adminNotes,
        transactionHash
      );

        // Deduct from pool wallet balance
        try {
          // Get current pool balance for the currency
          const balanceResult = await query(`
            SELECT balance FROM user_balances 
            WHERE user_id = (SELECT id FROM users WHERE email = 'pool@uobsecurity.com' LIMIT 1)
            AND currency = $1
          `, [request.currency]);
          
          if (balanceResult.rows.length > 0) {
            const currentBalance = parseFloat(balanceResult.rows[0].balance);
            const newBalance = currentBalance - parseFloat(request.amount);
            
            if (newBalance >= 0) {
              // Update pool wallet balance
              await query(`
                UPDATE user_balances 
                SET balance = $1, updated_at = NOW()
                WHERE user_id = (SELECT id FROM users WHERE email = 'pool@uobsecurity.com' LIMIT 1)
                AND currency = $2
              `, [newBalance, request.currency]);
              
              console.log(`✅ Pool wallet ${request.currency} balance updated: ${currentBalance} → ${newBalance}`);
            } else {
              console.error(`❌ Insufficient pool wallet balance: ${currentBalance} < ${request.amount}`);
            }
          }
        } catch (balanceError) {
          console.error('Error updating pool wallet balance:', balanceError);
          // Don't fail the transaction, just log the error
        }

      res.json({
        success: true,
        message: 'Withdrawal approved and completed successfully',
        data: {
          ...updatedRequest,
          transactionHash: transactionHash
        }
      });
    } catch (transactionError) {
      console.error('Blockchain transaction error:', transactionError);
      
      // Update status to failed
      await WithdrawalRequest.updateStatus(
        req.params.id,
        'failed',
        req.user.id,
        adminNotes + ' - Transaction error: ' + transactionError.message
      );

      res.status(500).json({
        success: false,
        message: 'Transaction failed: ' + transactionError.message
      });
    }
  } catch (error) {
    console.error('Error approving withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve withdrawal request'
    });
  }
});

// Reject withdrawal request (admin only)
router.post('/admin/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const request = await WithdrawalRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal request is not pending'
      });
    }

    // Refund user's balance since withdrawal is rejected
    try {
      const userBalanceResult = await query(`
        SELECT balance FROM user_balances 
        WHERE user_id = $1 AND currency = $2
      `, [request.userId, request.currency]);
      
      if (userBalanceResult.rows.length > 0) {
        const currentBalance = parseFloat(userBalanceResult.rows[0].balance);
        const refundedBalance = currentBalance + parseFloat(request.amount);
        
        // Refund user's balance
        await query(`
          UPDATE user_balances 
          SET balance = $1, available_balance = $1, updated_at = NOW()
          WHERE user_id = $2 AND currency = $3
        `, [refundedBalance, request.userId, request.currency]);
        
        console.log(`✅ User ${request.userId} ${request.currency} balance refunded: ${currentBalance} → ${refundedBalance}`);
      }
    } catch (balanceError) {
      console.error('Error refunding user balance:', balanceError);
      // Don't fail the rejection, just log the error
    }

    // Update status to rejected
    const updatedRequest = await WithdrawalRequest.updateStatus(
      req.params.id,
      'rejected',
      req.user.id,
      adminNotes
    );

    // Log rejected withdrawal to transactions_ledger for recent activities
    try {
      await query(`
        INSERT INTO transactions_ledger (
          user_id, type, currency, amount, reference_id, meta, created_at
        ) VALUES ($1, 'withdrawal_rejected', $2, $3, $4, $5, NOW())
      `, [
        request.userId,
        request.currency,
        parseFloat(request.amount),
        request.id,
        JSON.stringify({
          description: `Withdrawal rejected: ${request.amount} ${request.currency}`,
          status: 'rejected',
          admin_notes: adminNotes,
          destination_address: request.destinationAddress,
          withdrawal_id: request.id
        })
      ]);
    } catch (logError) {
      console.error('Error logging rejected withdrawal:', logError);
      // Don't fail the rejection if logging fails
    }

    res.json({
      success: true,
      message: 'Withdrawal request rejected',
      data: updatedRequest
    });
  } catch (error) {
    console.error('Error rejecting withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject withdrawal request'
    });
  }
});

// Complete withdrawal request (admin only) - This triggers the actual blockchain transaction
router.post('/admin/:id/complete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { transactionHash } = req.body;
    const request = await WithdrawalRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal request must be approved before completion'
      });
    }

    // Validate destination address
    if (!blockchainService.validateAddress(request.destinationAddress, request.currency)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid destination address'
      });
    }

    // Check if pool wallet has sufficient funds
    const hasSufficientFunds = await blockchainService.checkSufficientFunds(
      request.currency, 
      request.amount
    );

    if (!hasSufficientFunds) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient funds in pool wallet'
      });
    }

    try {
      // Simulate blockchain transaction (in production, use real blockchain service)
      const transactionResult = await blockchainService.simulateTransaction(
        request.currency,
        request.amount,
        request.destinationAddress,
        'pool-wallet-address' // This would be the actual pool wallet address
      );

      if (transactionResult.success) {
        // Update withdrawal request with transaction details
        const updatedRequest = await WithdrawalRequest.updateStatus(
          req.params.id,
          'completed',
          req.user.id,
          null,
          transactionResult.transactionHash
        );

        // Log completed withdrawal to transactions_ledger for recent activities
        try {
          await query(`
            INSERT INTO transactions_ledger (
              user_id, type, currency, amount, reference_id, meta, created_at
            ) VALUES ($1, 'withdrawal_completed', $2, $3, $4, $5, NOW())
          `, [
            request.userId,
            request.currency,
            parseFloat(request.amount),
            request.id,
            JSON.stringify({
              description: `Withdrawal completed: ${request.amount} ${request.currency}`,
              status: 'completed',
              transaction_hash: transactionResult.transactionHash,
              destination_address: request.destinationAddress,
              withdrawal_id: request.id
            })
          ]);
        } catch (logError) {
          console.error('Error logging completed withdrawal:', logError);
          // Don't fail the completion if logging fails
        }

        // Deduct from user's balance and update pool wallet balance
        try {
          // 1. Deduct from user's balance (this should have been done when request was created, but let's ensure it)
          const userBalanceResult = await query(`
            SELECT balance FROM user_balances 
            WHERE user_id = $1 AND currency = $2
          `, [request.userId, request.currency]);
          
          if (userBalanceResult.rows.length > 0) {
            const currentUserBalance = parseFloat(userBalanceResult.rows[0].balance);
            const newUserBalance = currentUserBalance - parseFloat(request.amount);
            
            if (newUserBalance >= 0) {
              // Update user's balance
              await query(`
                UPDATE user_balances 
                SET balance = $1, available_balance = $1, updated_at = NOW()
                WHERE user_id = $2 AND currency = $3
              `, [newUserBalance, request.userId, request.currency]);
              
              console.log(`✅ User ${request.userId} ${request.currency} balance updated: ${currentUserBalance} → ${newUserBalance}`);
            } else {
              console.error(`❌ Insufficient user balance: ${currentUserBalance} < ${request.amount}`);
            }
          }
          
          // 2. Deduct from pool wallet balance
          const poolBalanceResult = await query(`
            SELECT balance FROM user_balances 
            WHERE user_id = (SELECT id FROM users WHERE email = 'pool@uobsecurity.com' LIMIT 1)
            AND currency = $1
          `, [request.currency]);
          
          if (poolBalanceResult.rows.length > 0) {
            const currentPoolBalance = parseFloat(poolBalanceResult.rows[0].balance);
            const newPoolBalance = currentPoolBalance - parseFloat(request.amount);
            
            if (newPoolBalance >= 0) {
              // Update pool wallet balance
              await query(`
                UPDATE user_balances 
                SET balance = $1, updated_at = NOW()
                WHERE user_id = (SELECT id FROM users WHERE email = 'pool@uobsecurity.com' LIMIT 1)
                AND currency = $2
              `, [newPoolBalance, request.currency]);
              
              console.log(`✅ Pool wallet ${request.currency} balance updated: ${currentPoolBalance} → ${newPoolBalance}`);
            } else {
              console.error(`❌ Insufficient pool wallet balance: ${currentPoolBalance} < ${request.amount}`);
            }
          }
        } catch (balanceError) {
          console.error('Error updating balances:', balanceError);
          // Don't fail the transaction, just log the error
        }

        res.json({
          success: true,
          message: 'Withdrawal completed successfully',
          data: {
            ...updatedRequest,
            transactionDetails: transactionResult
          }
        });
      } else {
        // Mark as failed
        await WithdrawalRequest.updateStatus(
          req.params.id,
          'failed',
          req.user.id,
          'Blockchain transaction failed'
        );

        res.status(400).json({
          success: false,
          message: 'Blockchain transaction failed'
        });
      }
    } catch (blockchainError) {
      console.error('Blockchain transaction error:', blockchainError);
      
      // Mark as failed
      await WithdrawalRequest.updateStatus(
        req.params.id,
        'failed',
        req.user.id,
        `Blockchain error: ${blockchainError.message}`
      );

      res.status(500).json({
        success: false,
        message: 'Blockchain transaction failed',
        error: blockchainError.message
      });
    }
  } catch (error) {
    console.error('Error completing withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete withdrawal request'
    });
  }
});


module.exports = router;
