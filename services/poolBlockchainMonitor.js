const { ethers } = require('ethers');
const axios = require('axios');
const { query } = require('../config/database');
const Wallet = require('../models/Wallet');
const poolWalletService = require('./poolWalletService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

class PoolBlockchainMonitor {
  constructor() {
    this.ethProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    this.btcApiUrl = process.env.BTC_API_URL;
    this.poolAddresses = null;
    this.monitoringIntervals = {};
    this.processedTransactions = new Set(); // Track processed transactions
  }

  async startMonitoring() {
    console.log('🚀 Starting pool wallet blockchain monitoring...');
    
    // Get pool addresses
    this.poolAddresses = await poolWalletService.getPoolAddresses();
    console.log('📋 Monitoring pool addresses:', this.poolAddresses);
    
    // Start monitoring for Ethereum/USDT (every 1 minute)
    this.startEthMonitoring(60 * 1000);
    
    // Start monitoring for Bitcoin (every 2 minutes)
    this.startBtcMonitoring(2 * 60 * 1000);
  }

  async startEthMonitoring(interval) {
    if (this.monitoringIntervals.eth) {
      clearInterval(this.monitoringIntervals.eth);
    }
    
    this.monitoringIntervals.eth = setInterval(async () => {
      try {
        console.log('🔍 Checking Ethereum/USDT pool deposits...');
        await this.checkEthDeposits();
        console.log('✅ Ethereum monitoring complete');
      } catch (error) {
        console.error('❌ Error during Ethereum monitoring:', error.message);
      }
    }, interval);
  }

  async startBtcMonitoring(interval) {
    if (this.monitoringIntervals.btc) {
      clearInterval(this.monitoringIntervals.btc);
    }
    
    this.monitoringIntervals.btc = setInterval(async () => {
      try {
        console.log('🔍 Checking Bitcoin pool deposits...');
        await this.checkBtcDeposits();
        console.log('✅ Bitcoin monitoring complete');
      } catch (error) {
        console.error('❌ Error during Bitcoin monitoring:', error.message);
      }
    }, interval);
  }

  async checkEthDeposits() {
    if (!this.poolAddresses?.eth) return;

    try {
      const latestBlockNumber = await this.ethProvider.getBlockNumber();
      const startBlock = latestBlockNumber - 1000; // Check last 1000 blocks

      // Check ETH deposits to pool address
      await this.monitorEthAddress(this.poolAddresses.eth, 'ETH', startBlock, latestBlockNumber);
      
      // Check USDT deposits to pool address
      await this.monitorEthAddress(this.poolAddresses.eth, 'USDT', startBlock, latestBlockNumber);
      
    } catch (error) {
      console.error('Error checking ETH deposits:', error);
    }
  }

  async checkBtcDeposits() {
    if (!this.poolAddresses?.btc) return;

    try {
      const response = await axios.get(`${this.btcApiUrl}/address/${this.poolAddresses.btc}/utxo`);
      const utxos = response.data;

      for (const utxo of utxos) {
        const txId = utxo.txid;
        
        // Skip if already processed
        if (this.processedTransactions.has(txId)) continue;
        
        // Get transaction details
        const txResponse = await axios.get(`${this.btcApiUrl}/tx/${txId}`);
        const tx = txResponse.data;
        
        // Find the output that goes to our pool address
        const output = tx.vout.find(out => 
          out.scriptpubkey_address === this.poolAddresses.btc
        );
        
        if (output) {
          const amount = output.value / 100000000; // Convert satoshis to BTC
          
          if (amount > 0) {
            await this.processPoolDeposit('BTC', amount, txId, this.poolAddresses.btc);
            this.processedTransactions.add(txId);
          }
        }
      }
    } catch (error) {
      if (error.response?.status === 404) {
        // No UTXOs found, which is normal
        console.log('📭 No new BTC deposits to pool address');
      } else {
        console.error('Error checking BTC deposits:', error);
      }
    }
  }

  async monitorEthAddress(address, currency, fromBlock, toBlock) {
    try {
      if (currency === 'ETH') {
        // Check ETH transfers
        const filter = {
          fromBlock,
          toBlock,
          to: address
        };
        
        const logs = await this.ethProvider.getLogs(filter);
        
        for (const log of logs) {
          const txHash = log.transactionHash;
          
          // Skip if already processed
          if (this.processedTransactions.has(txHash)) continue;
          
          const tx = await this.ethProvider.getTransaction(txHash);
          
          if (tx && tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
            const amount = parseFloat(ethers.formatEther(tx.value));
            
            if (amount > 0) {
              await this.processPoolDeposit('ETH', amount, txHash, address);
              this.processedTransactions.add(txHash);
            }
          }
        }
      } else if (currency === 'USDT') {
        // Check USDT transfers
        const usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        
        const filter = {
          fromBlock,
          toBlock,
          address: usdtContractAddress,
          topics: [
            ethers.id("Transfer(address,address,uint256)"),
            null,
            ethers.zeroPadValue(address, 32)
          ]
        };
        
        const logs = await this.ethProvider.getLogs(filter);
        
        for (const log of logs) {
          const txHash = log.transactionHash;
          
          // Skip if already processed
          if (this.processedTransactions.has(txHash)) continue;
          
          // Decode the log data
          const iface = new ethers.Interface([
            "event Transfer(address indexed from, address indexed to, uint256 value)"
          ]);
          
          const decodedLog = iface.parseLog(log);
          
          if (decodedLog && decodedLog.args.to.toLowerCase() === address.toLowerCase()) {
            const amount = parseFloat(ethers.formatUnits(decodedLog.args.value, 6)); // USDT has 6 decimals
            
            if (amount > 0) {
              await this.processPoolDeposit('USDT', amount, txHash, address);
              this.processedTransactions.add(txHash);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error monitoring ${currency} address ${address}:`, error);
    }
  }

  async processPoolDeposit(currency, amount, transactionHash, poolAddress) {
    try {
      // Check if transaction already processed
      const existingTx = await query(
        `SELECT * FROM deposit_requests WHERE transaction_hash = $1 AND currency = $2`,
        [transactionHash, currency]
      );

      if (existingTx.rows.length > 0) {
        console.log(`📝 Deposit ${transactionHash} already processed`);
        return;
      }

      // For pool wallet system, we need to identify which user made the deposit
      // This is tricky since all users share the same pool address
      // We'll need to implement a different approach:
      
      // Option 1: Use transaction memo/comment (if supported by the blockchain)
      // Option 2: Use exact amount matching (user tells us the amount they sent)
      // Option 3: Use a different system (QR codes with user ID, etc.)
      
      // For now, let's create a pending deposit that requires user confirmation
      await query(
        `INSERT INTO pool_deposits (currency, amount, pool_address, transaction_hash, status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)`,
        [currency, amount, poolAddress, transactionHash]
      );

      console.log(`💰 Pool deposit detected: ${amount} ${currency} (${transactionHash})`);
      
      // Notify admins about new pool deposit
      notificationService.notifyAdmins({
        type: 'info',
        title: 'New Pool Deposit',
        message: `${amount} ${currency} deposited to pool wallet`,
        data: {
          currency,
          amount,
          transactionHash,
          poolAddress
        }
      });

    } catch (error) {
      console.error('Error processing pool deposit:', error);
    }
  }

  // Method to claim a pool deposit for a specific user
  async claimPoolDeposit(depositId, userId) {
    try {
      const deposit = await query(
        `SELECT * FROM pool_deposits WHERE id = $1 AND status = 'pending'`,
        [depositId]
      );

      if (deposit.rows.length === 0) {
        throw new Error('Deposit not found or already processed');
      }

      const depositData = deposit.rows[0];

      // Update deposit status
      await query(
        `UPDATE pool_deposits SET status = 'claimed', user_id = $1, claimed_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [userId, depositId]
      );

      // Credit user's balance
      await Wallet.updateBalance(userId, depositData.currency, depositData.amount, 'add');

      // Create transaction record
      await query(
        `INSERT INTO transactions (user_id, type, from_currency, from_amount, to_currency, to_amount, status, description)
         VALUES ($1, 'deposit', $2, $3, $2, $3, 'completed', $4)`,
        [
          userId,
          depositData.currency,
          depositData.amount,
          `Deposit ${depositData.amount} ${depositData.currency} to pool wallet`
        ]
      );

      // Get user info for notifications
      const user = await query('SELECT * FROM users WHERE id = $1', [userId]);
      const userData = user.rows[0];

      // Send notifications
      notificationService.notifyDeposit(
        userId,
        depositData.currency,
        depositData.amount,
        depositData.transaction_hash
      );

      // Send email notification
      await emailService.sendDepositConfirmation(
        userData.email,
        userData.full_name,
        depositData.currency,
        depositData.amount,
        depositData.transaction_hash
      );

      console.log(`✅ Pool deposit claimed: User ${userId} credited ${depositData.amount} ${depositData.currency}`);

      return {
        success: true,
        message: 'Deposit claimed successfully',
        amount: depositData.amount,
        currency: depositData.currency
      };

    } catch (error) {
      console.error('Error claiming pool deposit:', error);
      throw error;
    }
  }

  // Method to get pending pool deposits
  async getPendingPoolDeposits() {
    try {
      const result = await query(
        `SELECT * FROM pool_deposits WHERE status = 'pending' ORDER BY created_at DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching pending pool deposits:', error);
      throw error;
    }
  }

  // Method to get pool wallet balances
  async getPoolBalances() {
    return await poolWalletService.getPoolBalances();
  }
}

module.exports = new PoolBlockchainMonitor();
