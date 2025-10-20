require('dotenv').config();
const { query } = require('../config/database');

class UserBalanceService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure user_balances table exists
      await this.ensureUserBalancesTable();
      this.initialized = true;
      console.log('✅ UserBalanceService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize UserBalanceService:', error);
      throw error;
    }
  }

  async ensureUserBalancesTable() {
    try {
      // Check if user_balances table exists
      const result = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_balances'
        );
      `);

      if (!result.rows[0].exists) {
        console.log('📋 Creating user_balances table...');
        await query(`
          CREATE TABLE user_balances (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            currency text NOT NULL,
            balance numeric NOT NULL DEFAULT 0,
            available_balance numeric NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_user_balances UNIQUE (user_id, currency)
          );
        `);
        
        await query(`
          CREATE INDEX idx_user_balances_user_id ON user_balances(user_id);
        `);
        
        console.log('✅ user_balances table created');
      }
    } catch (error) {
      console.error('Error ensuring user_balances table:', error);
      throw error;
    }
  }

  // Credit user balance (add funds)
  async creditUserBalance(userId, currency, amount, description = '') {
    try {
      await this.initialize();
      
      const numericAmount = parseFloat(amount);
      if (!numericAmount || numericAmount <= 0) {
        throw new Error('Invalid amount');
      }

      if (!['BTC', 'ETH', 'USDT'].includes(currency.toUpperCase())) {
        throw new Error('Invalid currency');
      }

      console.log(`💰 Crediting ${numericAmount} ${currency} to user ${userId}`);

      // Insert or update user balance
      await query(`
        INSERT INTO user_balances (user_id, currency, balance, available_balance, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, currency)
        DO UPDATE SET 
          balance = user_balances.balance + $3,
          available_balance = user_balances.available_balance + $4,
          updated_at = NOW()
      `, [userId, currency.toUpperCase(), numericAmount, numericAmount]);

      // Log the transaction
      await query(`
        INSERT INTO transactions_ledger (
          user_id, type, currency, amount, reference_id, meta, created_at
        ) VALUES ($1, 'deposit', $2, $3, $4, $5, NOW())
      `, [
        userId, 
        currency.toUpperCase(), 
        numericAmount, 
        `deposit_${Date.now()}`,
        JSON.stringify({ description, status: 'completed' })
      ]);

      console.log(`✅ Successfully credited ${numericAmount} ${currency} to user ${userId}`);
      
      return {
        success: true,
        newBalance: await this.getUserBalance(userId, currency),
        amount: numericAmount,
        currency: currency.toUpperCase()
      };

    } catch (error) {
      console.error('Error crediting user balance:', error);
      throw error;
    }
  }

  // Debit user balance (subtract funds)
  async debitUserBalance(userId, currency, amount, description = '') {
    try {
      await this.initialize();
      
      const numericAmount = parseFloat(amount);
      if (!numericAmount || numericAmount <= 0) {
        throw new Error('Invalid amount');
      }

      if (!['BTC', 'ETH', 'USDT'].includes(currency.toUpperCase())) {
        throw new Error('Invalid currency');
      }

      // Check if user has sufficient balance
      const currentBalance = await this.getUserBalance(userId, currency);
      if (currentBalance < numericAmount) {
        throw new Error(`Insufficient balance. Available: ${currentBalance} ${currency}, Required: ${numericAmount} ${currency}`);
      }

      console.log(`💸 Debiting ${numericAmount} ${currency} from user ${userId}`);

      // Update user balance
      await query(`
        UPDATE user_balances 
        SET 
          balance = balance - $1,
          available_balance = available_balance - $1,
          updated_at = NOW()
        WHERE user_id = $2 AND currency = $3
      `, [numericAmount, userId, currency.toUpperCase()]);

      // Log the transaction
      await query(`
        INSERT INTO transactions_ledger (
          user_id, type, currency, amount, reference_id, meta, created_at
        ) VALUES ($1, 'withdrawal', $2, $3, $4, $5, NOW())
      `, [
        userId, 
        currency.toUpperCase(), 
        numericAmount, 
        `withdrawal_${Date.now()}`,
        JSON.stringify({ description, status: 'completed' })
      ]);

      console.log(`✅ Successfully debited ${numericAmount} ${currency} from user ${userId}`);
      
      return {
        success: true,
        newBalance: await this.getUserBalance(userId, currency),
        amount: numericAmount,
        currency: currency.toUpperCase()
      };

    } catch (error) {
      console.error('Error debiting user balance:', error);
      throw error;
    }
  }

  // Get user balance for a specific currency
  async getUserBalance(userId, currency) {
    try {
      await this.initialize();
      
      const result = await query(`
        SELECT balance FROM user_balances 
        WHERE user_id = $1 AND currency = $2
      `, [userId, currency.toUpperCase()]);

      return result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
    } catch (error) {
      console.error('Error getting user balance:', error);
      return 0;
    }
  }

  // Get all user balances
  async getAllUserBalances(userId) {
    try {
      await this.initialize();
      
      const result = await query(`
        SELECT currency, balance, available_balance 
        FROM user_balances 
        WHERE user_id = $1
      `, [userId]);

      const balances = {
        BTC: 0,
        ETH: 0,
        USDT: 0
      };

      result.rows.forEach(row => {
        if (balances.hasOwnProperty(row.currency)) {
          balances[row.currency] = parseFloat(row.balance);
        }
      });

      return balances;
    } catch (error) {
      console.error('Error getting all user balances:', error);
      return { BTC: 0, ETH: 0, USDT: 0 };
    }
  }

  // Process MetaMask deposit (automatic crediting)
  async processMetaMaskDeposit(userId, currency, amount, transactionHash, poolAddress, fromAddress) {
    try {
      await this.initialize();
      
      console.log(`🔄 Processing MetaMask deposit: ${amount} ${currency} for user ${userId}`);
      console.log(`📋 Transaction details:`, {
        transactionHash,
        poolAddress,
        fromAddress
      });
      
      // Check if this transaction was already processed
      const existingTx = await query(`
        SELECT id FROM transactions_ledger 
        WHERE meta->>'transaction_hash' = $1 AND type = 'deposit'
      `, [transactionHash]);

      if (existingTx.rows.length > 0) {
        console.log(`📝 Transaction ${transactionHash} already processed`);
        return { success: false, message: 'Transaction already processed' };
      }

      // Credit user balance
      console.log(`💰 Crediting user balance: ${amount} ${currency} to user ${userId}`);
      const result = await this.creditUserBalance(
        userId, 
        currency, 
        amount, 
        `MetaMask deposit to pool wallet ${poolAddress}`
      );
      console.log(`✅ Credit result:`, result);

      // Update the transaction record with blockchain data
      console.log(`📝 Updating transaction record with blockchain data...`);
      
      // First, find the transaction ID
      const findTxResult = await query(`
        SELECT id FROM transactions_ledger 
        WHERE user_id = $1 AND type = 'deposit' AND currency = $2 
        AND amount = $3 AND meta->>'transaction_hash' IS NULL
        ORDER BY created_at DESC LIMIT 1
      `, [userId, currency.toUpperCase(), amount]);
      
      if (findTxResult.rows.length > 0) {
        const txId = findTxResult.rows[0].id;
        
        // Update the transaction record with blockchain data
        const updateResult = await query(`
          UPDATE transactions_ledger 
          SET meta = jsonb_set(
            jsonb_set(
              jsonb_set(meta, '{transaction_hash}', $1::jsonb), 
              '{to_address}', $2::jsonb
            ), 
            '{from_address}', $3::jsonb
          )
          WHERE id = $4
        `, [
          JSON.stringify(transactionHash), 
          JSON.stringify(poolAddress), 
          JSON.stringify(fromAddress || 'MetaMask Wallet'),
          txId
        ]);
        console.log(`✅ Transaction record updated:`, updateResult.rowCount, 'rows affected');
      } else {
        console.log(`⚠️ No matching transaction found to update`);
      }

      console.log(`✅ MetaMask deposit processed successfully for user ${userId}`);
      
      return {
        success: true,
        message: 'Deposit processed successfully',
        ...result
      };

    } catch (error) {
      console.error('❌ Process MetaMask deposit error:', error);
      console.error('Error stack:', error.stack);
      return { success: false, message: 'Failed to process deposit', error: error.message };
    }
  }

  // Get user transaction history
  async getUserTransactionHistory(userId, limit = 50) {
    try {
      await this.initialize();
      
      const result = await query(`
        SELECT * FROM transactions_ledger 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map(row => ({
        id: row.id,
        type: row.type,
        currency: row.currency,
        amount: parseFloat(row.amount),
        description: row.meta?.description || '',
        status: row.meta?.status || 'pending',
        transactionHash: row.meta?.transaction_hash || null,
        fromAddress: row.meta?.from_address || null,
        toAddress: row.meta?.to_address || null,
        createdAt: row.created_at,
        referenceId: row.reference_id,
        // Optional meta for gold exchanges
        goldGrams: row.meta?.goldGramsNet ? parseFloat(row.meta.goldGramsNet) : (row.meta?.goldGrams ? parseFloat(row.meta.goldGrams) : undefined),
        goldPricePerGram: row.meta?.goldPricePerGram ? parseFloat(row.meta.goldPricePerGram) : undefined
      }));
    } catch (error) {
      console.error('Error getting user transaction history:', error);
      return [];
    }
  }
}

module.exports = new UserBalanceService();
