const { query } = require('../config/database');
const Wallet = require('../models/Wallet');
const poolWalletService = require('./poolWalletService');

class WithdrawalService {
  constructor() {
    // Withdrawal fees (configurable)
    this.fees = {
      BTC: 0.0005, // 0.05%
      ETH: 0.005,  // 0.5%
      USDT: 0.01   // 1%
    };
  }

  /**
   * Create withdrawal request (user)
   */
  async createWithdrawalRequest(userId, currency, amount, destinationAddress) {
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive.');
    }

    try {
      // Check if user has sufficient balance
      const userWallet = await Wallet.findByUserId(userId);
      if (!userWallet) {
        throw new Error('User wallet not found.');
      }

      const currencyColumn = `${currency.toLowerCase()}_balance`;
      const balance = parseFloat(userWallet[currencyColumn]);

      if (balance < amount) {
        throw new Error(`Insufficient ${currency} balance. Available: ${balance}, Requested: ${amount}`);
      }

      // Calculate fee
      const feeRate = this.fees[currency.toUpperCase()] || 0;
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
   * Get pending withdrawals (admin)
   */
  async getPendingWithdrawals() {
    try {
      const result = await query(
        `SELECT wr.*, u.full_name, u.email 
         FROM withdrawal_requests wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.status = 'pending'
         ORDER BY wr.created_at ASC`
      );
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        userName: row.full_name,
        userEmail: row.email,
        currency: row.currency,
        amount: parseFloat(row.amount),
        destinationAddress: row.destination_address,
        fee: parseFloat(row.fee),
        netAmount: parseFloat(row.net_amount),
        status: row.status,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error fetching pending withdrawals:', error);
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
        `SELECT wr.*, u.full_name, u.email 
         FROM withdrawal_requests wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.id = $1 AND wr.status = 'pending'`,
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found or already processed');
      }

      const withdrawal = withdrawalResult.rows[0];

      // Send from pool wallet
      let transactionHash;
      try {
        transactionHash = await poolWalletService.sendFromPool(
          withdrawal.currency,
          withdrawal.destination_address,
          withdrawal.net_amount
        );
      } catch (error) {
        // If sending fails, refund user's balance
        await Wallet.updateBalance(withdrawal.user_id, withdrawal.currency, withdrawal.amount, 'add');
        
        // Update withdrawal status to failed
        await query(
          `UPDATE withdrawal_requests SET status = 'failed', admin_notes = $1, admin_id = $2 WHERE id = $3`,
          [`Failed to send: ${error.message}`, adminUserId, withdrawalId]
        );
        
        throw new Error(`Failed to process withdrawal: ${error.message}`);
      }

      // Update withdrawal status
      await query(
        `UPDATE withdrawal_requests 
         SET status = 'completed', transaction_hash = $1, admin_id = $2, approved_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [transactionHash, adminUserId, withdrawalId]
      );

      // Update transaction record
      await query(
        `UPDATE transactions 
         SET status = 'completed', transaction_hash = $1, completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND type = 'withdrawal_request' AND status = 'pending' AND from_currency = $3`,
        [transactionHash, withdrawal.user_id, withdrawal.currency]
      );

      console.log(`✅ Withdrawal approved and processed: ${withdrawal.amount} ${withdrawal.currency} to ${withdrawal.destination_address}`);

      return {
        message: 'Withdrawal approved and processed successfully.',
        withdrawalId: withdrawal.id,
        transactionHash: transactionHash,
        status: 'completed'
      };

    } catch (error) {
      console.error('Error approving withdrawal:', error);
      throw error;
    }
  }

  /**
   * Reject withdrawal (admin only)
   */
  async rejectWithdrawal(withdrawalId, adminUserId, reason) {
    try {
      // Get withdrawal request
      const withdrawalResult = await query(
        `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending'`,
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
        `UPDATE withdrawal_requests 
         SET status = 'rejected', rejection_reason = $1, admin_id = $2, approved_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [reason, adminUserId, withdrawalId]
      );

      // Update transaction record
      await query(
        `UPDATE transactions 
         SET status = 'rejected', completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND type = 'withdrawal_request' AND status = 'pending' AND from_currency = $2`,
        [withdrawal.user_id, withdrawal.currency]
      );

      console.log(`❌ Withdrawal rejected: ${withdrawal.amount} ${withdrawal.currency} - ${reason}`);

      return {
        message: 'Withdrawal request rejected and funds refunded.',
        withdrawalId: withdrawal.id,
        status: 'rejected'
      };

    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }
}

module.exports = new WithdrawalService();