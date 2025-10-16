const { ethers } = require('ethers');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const { query } = require('../config/database');
const poolWalletService = require('./poolWalletService');
const Wallet = require('../models/Wallet');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

class PoolWithdrawalService {
  constructor() {
    this.ethProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    this.btcApiUrl = process.env.BTC_API_URL;
    
    // Withdrawal fees (percentage)
    this.fees = {
      BTC: 0.0005, // 0.05%
      ETH: 0.005,  // 0.5%
      USDT: 0.01   // 1%
    };
  }

  /**
   * Create withdrawal request (from pool wallet)
   */
  async createWithdrawalRequest(userId, currency, amount, destinationAddress) {
    try {
      // Validate inputs
      if (!['BTC', 'ETH', 'USDT'].includes(currency)) {
        throw new Error('Invalid currency');
      }

      if (amount <= 0) {
        throw new Error('Amount must be positive');
      }

      // Get user's wallet
      const wallet = await Wallet.findByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Check user's balance
      const balanceColumn = `${currency.toLowerCase()}_balance`;
      const userBalance = parseFloat(wallet[balanceColumn] || 0);

      if (userBalance < amount) {
        throw new Error(`Insufficient ${currency} balance. Available: ${userBalance}, Requested: ${amount}`);
      }

      // Calculate fee and net amount
      const feeRate = this.fees[currency];
      const fee = amount * feeRate;
      const netAmount = amount - fee;

      if (netAmount <= 0) {
        throw new Error('Amount too small after fee. Net amount must be positive.');
      }

      // Deduct amount from user's balance immediately (pending status)
      await Wallet.updateBalance(userId, currency, amount, 'subtract');

      // Create withdrawal request record (using existing withdrawal_requests table)
      const result = await query(
        `INSERT INTO withdrawal_requests (user_id, currency, amount, destination_address, fee, net_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [userId, currency, amount, destinationAddress, fee, netAmount]
      );

      const withdrawalId = result.rows[0].id;

      // Record transaction
      await query(
        `INSERT INTO transactions (user_id, type, from_currency, from_amount, to_currency, to_amount, status, fee_amount, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          'withdrawal_request',
          currency,
          amount,
          currency,
          netAmount,
          'pending',
          fee,
          `Withdrawal request: ${amount} ${currency} to ${destinationAddress}`
        ]
      );

      // Notify admins about new withdrawal request
      const user = await query('SELECT full_name FROM users WHERE id = $1', [userId]);
      const userName = user.rows[0]?.full_name || 'Unknown User';

      notificationService.notifyPendingWithdrawal(
        userId,
        userName,
        currency,
        amount,
        withdrawalId
      );

      console.log(`📤 Withdrawal request created: User ${userId} requested ${amount} ${currency}`);

      return {
        message: 'Withdrawal request submitted. Awaiting admin approval.',
        withdrawalId: withdrawalId,
        fee: parseFloat(fee.toFixed(8)),
        netAmount: parseFloat(netAmount.toFixed(8)),
        status: 'pending'
      };

    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      throw error;
    }
  }

  /**
   * Approve and process withdrawal (admin only)
   */
  async approveWithdrawal(withdrawalId, adminUserId) {
    try {
      // Get withdrawal request
      const withdrawalResult = await query(
        `SELECT pw.*, u.full_name, u.email 
         FROM pool_withdrawals pw
         JOIN users u ON pw.user_id = u.id
         WHERE pw.id = $1 AND pw.status = 'pending'`,
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found or already processed');
      }

      const withdrawal = withdrawalResult.rows[0];

      // Calculate fee and net amount
      const feeRate = this.fees[withdrawal.currency];
      const fee = withdrawal.amount * feeRate;
      const netAmount = withdrawal.amount - fee;

      // Send from pool wallet
      let transactionHash;
      try {
        transactionHash = await poolWalletService.sendFromPool(
          withdrawal.currency,
          withdrawal.destination_address,
          netAmount
        );
      } catch (error) {
        // If sending fails, refund user's balance
        await Wallet.updateBalance(withdrawal.user_id, withdrawal.currency, withdrawal.amount, 'add');
        
        // Update withdrawal status to failed
        await query(
          `UPDATE pool_withdrawals SET status = 'rejected', admin_notes = $1, approved_by = $2 WHERE id = $3`,
          [`Failed to send: ${error.message}`, adminUserId, withdrawalId]
        );
        
        throw new Error(`Failed to process withdrawal: ${error.message}`);
      }

      // Update withdrawal status
      await query(
        `UPDATE pool_withdrawals 
         SET status = 'completed', transaction_hash = $1, approved_by = $2, completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [transactionHash, adminUserId, withdrawalId]
      );

      // Update transaction record
      await query(
        `UPDATE transactions 
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND type = 'withdrawal_request' AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [withdrawal.user_id]
      );

      // Send notifications
      notificationService.notifyWithdrawalApproval(
        withdrawal.user_id,
        withdrawal.currency,
        netAmount,
        transactionHash
      );

      // Send email notification
      await emailService.sendWithdrawalApproval(
        withdrawal.email,
        withdrawal.full_name,
        withdrawal.currency,
        netAmount,
        withdrawal.destination_address,
        transactionHash
      );

      console.log(`✅ Withdrawal approved and processed: ${netAmount} ${withdrawal.currency} sent to ${withdrawal.destination_address}`);

      return {
        message: 'Withdrawal approved and processed successfully.',
        withdrawalId: withdrawalId,
        transactionHash: transactionHash,
        netAmount: netAmount,
        status: 'completed'
      };

    } catch (error) {
      console.error('Error approving withdrawal:', error);
      throw error;
    }
  }

  /**
   * Reject withdrawal request (admin only)
   */
  async rejectWithdrawal(withdrawalId, adminUserId, reason) {
    try {
      // Get withdrawal request
      const withdrawalResult = await query(
        `SELECT * FROM pool_withdrawals WHERE id = $1 AND status = 'pending'`,
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found or already processed');
      }

      const withdrawal = withdrawalResult.rows[0];

      // Refund user's balance
      await Wallet.updateBalance(withdrawal.user_id, withdrawal.currency, withdrawal.amount, 'add');

      // Update withdrawal status
      await query(
        `UPDATE pool_withdrawals 
         SET status = 'rejected', admin_notes = $1, approved_by = $2, completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [reason, adminUserId, withdrawalId]
      );

      // Update transaction record
      await query(
        `UPDATE transactions 
         SET status = 'rejected', completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND type = 'withdrawal_request' AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [withdrawal.user_id]
      );

      // Send notifications
      notificationService.notifyWithdrawalRejection(
        withdrawal.user_id,
        withdrawal.currency,
        withdrawal.amount,
        reason
      );

      // Get user info for email
      const userResult = await query('SELECT full_name, email FROM users WHERE id = $1', [withdrawal.user_id]);
      const user = userResult.rows[0];

      // Send email notification
      await emailService.sendWithdrawalRejection(
        user.email,
        user.full_name,
        withdrawal.currency,
        withdrawal.amount,
        reason
      );

      console.log(`❌ Withdrawal rejected: ${withdrawal.amount} ${withdrawal.currency} refunded to user ${withdrawal.user_id}`);

      return {
        message: 'Withdrawal request rejected and funds refunded.',
        withdrawalId: withdrawalId,
        status: 'rejected'
      };

    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }

  /**
   * Get pending withdrawal requests (admin only)
   */
  async getPendingWithdrawals() {
    try {
      const result = await query(
        `SELECT pw.*, u.full_name, u.email 
         FROM pool_withdrawals pw
         JOIN users u ON pw.user_id = u.id
         WHERE pw.status = 'pending'
         ORDER BY pw.created_at ASC`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching pending withdrawals:', error);
      throw error;
    }
  }

  /**
   * Get withdrawal history for a user
   */
  async getUserWithdrawals(userId) {
    try {
      const result = await query(
        `SELECT * FROM pool_withdrawals 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching user withdrawals:', error);
      throw error;
    }
  }

  /**
   * Get all withdrawal history (admin only)
   */
  async getAllWithdrawals() {
    try {
      const result = await query(
        `SELECT pw.*, u.full_name, u.email, a.full_name as approved_by_name
         FROM pool_withdrawals pw
         JOIN users u ON pw.user_id = u.id
         LEFT JOIN users a ON pw.approved_by = a.id
         ORDER BY pw.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching all withdrawals:', error);
      throw error;
    }
  }
}

module.exports = new PoolWithdrawalService();
