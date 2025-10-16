const { ethers } = require('ethers');
const axios = require('axios');
const { query } = require('../config/database');
const Wallet = require('../models/Wallet');
const poolWalletService = require('./poolWalletService');
const walletAddressService = require('./walletAddressService');

class BlockchainMonitorService {
  constructor() {
    // Ethereum provider (using Infura or Alchemy - configure in .env)
    this.ethProvider = process.env.ETH_RPC_URL 
      ? new ethers.JsonRpcProvider(process.env.ETH_RPC_URL)
      : null;
    
    // Bitcoin API (using BlockCypher or similar)
    this.btcApiUrl = process.env.BTC_API_URL || 'https://blockstream.info/api';
    
    // USDT contract address (Ethereum mainnet)
    this.usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    
    // ERC-20 ABI for USDT
    this.erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint amount) returns (bool)',
      'event Transfer(address indexed from, address indexed to, uint amount)'
    ];
    
    // Monitoring intervals
    this.btcMonitorInterval = null;
    this.ethMonitorInterval = null;
    this.isMonitoring = false;
    this.poolInitialized = false;
  }

  /**
   * Start monitoring all blockchains
   */
  async startMonitoring() {
    console.log('ℹ️ Per-user blockchain monitoring is disabled under the pool wallet model. Use poolBlockchainMonitor.');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() { /* no-op under pool model */ }

  /**
   * Monitor Bitcoin deposits
   */
  async monitorBitcoinDeposits() {
    try {
      console.log('🔍 Checking Bitcoin deposits...');

      // Get all user BTC addresses
      const result = await query(
        'SELECT user_id, btc_address FROM wallets WHERE btc_address IS NOT NULL'
      );

      const addresses = result.rows;

      for (const { user_id, btc_address } of addresses) {
        try {
          // Check address balance and transactions
          const txs = await this.getBTCTransactions(btc_address);
          
          for (const tx of txs) {
            // Check if transaction already recorded
            const existing = await query(
              'SELECT id FROM deposit_requests WHERE transaction_hash = $1',
              [tx.txid]
            );

            if (existing.rows.length === 0) {
              // New deposit detected!
              await this.processNewBTCDeposit(user_id, btc_address, tx);
            } else {
              // Update confirmations for existing deposit
              await this.updateBTCConfirmations(tx.txid, tx.confirmations);
            }
          }
        } catch (error) {
          console.error(`Error monitoring BTC address ${btc_address}:`, error.message);
        }
      }

      console.log('✅ Bitcoin monitoring complete');
    } catch (error) {
      console.error('Bitcoin monitoring error:', error);
    }
  }

  /**
   * Monitor Ethereum and USDT deposits
   */
  async monitorEthereumDeposits() {
    if (!this.ethProvider) {
      console.log('⚠️ Ethereum provider not configured');
      return;
    }

    try {
      console.log('🔍 Checking Ethereum/USDT deposits...');

      // Derive per-user ETH addresses using pool mapping to match what UI shows
      const usersRes = await query('SELECT id FROM users');
      const users = usersRes.rows.map(r => r.id);

      for (const user_id of users) {
        const eth_address = await poolWalletService.getUserDepositAddress(user_id, 'ETH');
        try {
          // Check ETH balance
          await this.checkETHDeposit(user_id, eth_address);
          
          // Check USDT balance
          await this.checkUSDTDeposit(user_id, eth_address);
        } catch (error) {
          console.error(`Error monitoring ETH address ${eth_address}:`, error.message);
        }
      }

      console.log('✅ Ethereum monitoring complete');
    } catch (error) {
      console.error('Ethereum monitoring error:', error);
    }
  }

  /**
   * Get Bitcoin transactions for an address
   */
  async getBTCTransactions(address) {
    try {
      const response = await axios.get(`${this.btcApiUrl}/address/${address}/txs`);
      const txs = response.data;
      
      // Filter for transactions that sent BTC to this address
      return txs.map(tx => {
        // Find output that goes to our address
        const output = tx.vout.find(out => 
          out.scriptpubkey_address === address
        );
        
        if (output) {
          return {
            txid: tx.txid,
            amount: output.value / 100000000, // Convert satoshis to BTC
            confirmations: tx.status.confirmed ? 
              (tx.status.block_height ? 1 : 0) : 0,
            time: tx.status.block_time
          };
        }
      }).filter(Boolean);
    } catch (error) {
      console.error('Error fetching BTC transactions:', error.message);
      return [];
    }
  }

  /**
   * Process new Bitcoin deposit
   */
  async processNewBTCDeposit(userId, address, tx) {
    try {
      console.log(`💰 New BTC deposit detected: ${tx.amount} BTC to ${address}`);

      // Create deposit request
      await query(
        `INSERT INTO deposit_requests 
         (user_id, currency, amount, wallet_address, transaction_hash, confirmations, required_confirmations, status, detected_at)
         VALUES ($1, 'BTC', $2, $3, $4, $5, 6, $6, NOW())`,
        [
          userId,
          tx.amount,
          address,
          tx.txid,
          tx.confirmations,
          tx.confirmations >= 6 ? 'completed' : 'confirming'
        ]
      );

      // If already has 6+ confirmations, credit immediately
      if (tx.confirmations >= 6) {
        await this.creditUserBalance(userId, 'BTC', tx.amount, tx.txid);
      }
    } catch (error) {
      console.error('Error processing BTC deposit:', error);
    }
  }

  /**
   * Update Bitcoin confirmations
   */
  async updateBTCConfirmations(txHash, confirmations) {
    try {
      const result = await query(
        `UPDATE deposit_requests 
         SET confirmations = $1,
             status = CASE 
               WHEN confirmations >= required_confirmations THEN 'completed'
               ELSE 'confirming'
             END,
             confirmed_at = CASE
               WHEN confirmations >= required_confirmations AND confirmed_at IS NULL THEN NOW()
               ELSE confirmed_at
             END
         WHERE transaction_hash = $2 AND status != 'completed'
         RETURNING *`,
        [confirmations, txHash]
      );

      // If just reached required confirmations, credit the user
      if (result.rows.length > 0) {
        const deposit = result.rows[0];
        if (deposit.status === 'completed' && !deposit.credited_at) {
          await this.creditUserBalance(
            deposit.user_id,
            deposit.currency,
            deposit.amount,
            deposit.transaction_hash
          );
        }
      }
    } catch (error) {
      console.error('Error updating BTC confirmations:', error);
    }
  }

  /**
   * Check Ethereum deposit
   */
  async checkETHDeposit(userId, address) {
    try {
      const balance = await this.ethProvider.getBalance(address);
      const ethBalance = parseFloat(ethers.formatEther(balance));

      // Get current recorded balance
      const result = await query(
        'SELECT eth_balance FROM wallets WHERE user_id = $1',
        [userId]
      );

      const currentBalance = parseFloat(result.rows[0]?.eth_balance || 0);
      const difference = ethBalance - currentBalance;

      // If there's a positive difference, it's a deposit
      if (difference > 0.0001) { // Minimum 0.0001 ETH
        console.log(`💰 ETH deposit detected: ${difference} ETH`);
        
        // Get recent transactions to find the actual tx hash
        // (This is simplified - in production you'd want to track specific tx hashes)
        await this.creditUserBalance(userId, 'ETH', difference, null);

        // Attempt auto-forwarding to pool wallet
        try {
          await this.autoForwardEthToPool(userId, address);
        } catch (forwardErr) {
          console.error('Auto-forward ETH failed:', forwardErr.message);
        }
      }
    } catch (error) {
      console.error('Error checking ETH deposit:', error);
    }
  }

  /**
   * Auto-forward user's ETH balance to pool wallet, keeping gas for fee
   */
  async autoForwardEthToPool(userId, fromAddress) {
    if (!this.ethProvider) return;

    const poolAddresses = this.poolInitialized ? poolWalletService.getPoolAddresses() : null;
    const toAddress = poolAddresses ? poolAddresses.eth : null;
    if (!toAddress) {
      throw new Error('Pool ETH address unavailable');
    }

    // Fetch encrypted private key for user's ETH address
    const walletRow = await query(
      'SELECT eth_private_key_encrypted FROM wallets WHERE user_id = $1 AND eth_address = $2',
      [userId, fromAddress]
    );

    const enc = walletRow.rows[0]?.eth_private_key_encrypted;
    if (!enc) {
      throw new Error('Missing user ETH private key for auto-forwarding');
    }

    const privateKey = walletAddressService.decrypt(enc);
    const signer = new ethers.Wallet(privateKey, this.ethProvider);

    // Double-check signer matches fromAddress
    if (signer.address.toLowerCase() !== fromAddress.toLowerCase()) {
      throw new Error('Decrypted private key does not match source address');
    }

    const balanceWei = await this.ethProvider.getBalance(fromAddress);
    if (balanceWei <= 0n) return;

    const gasPrice = await this.ethProvider.getGasPrice();
    const estimate = 21000n; // standard ETH transfer
    const feeWei = gasPrice * estimate;

    // Leave a tiny dust to avoid zeroing account; send rest
    const safety = 10000n; // 0.00000000000001 ETH
    if (balanceWei <= feeWei + safety) {
      console.log('⏭️ Not enough ETH to cover gas for forwarding');
      return;
    }

    const valueWei = balanceWei - feeWei - safety;

    const tx = await signer.sendTransaction({
      to: toAddress,
      value: valueWei,
      gasLimit: 21000,
      gasPrice
    });

    console.log(`🔁 Auto-forwarded ${ethers.formatEther(valueWei)} ETH from ${fromAddress} → ${toAddress}. Tx: ${tx.hash}`);
  }

  /**
   * Check USDT deposit
   */
  async checkUSDTDeposit(userId, address) {
    try {
      const contract = new ethers.Contract(
        this.usdtContractAddress,
        this.erc20Abi,
        this.ethProvider
      );

      const balance = await contract.balanceOf(address);
      const usdtBalance = parseFloat(ethers.formatUnits(balance, 6)); // USDT has 6 decimals

      // Get current recorded balance
      const result = await query(
        'SELECT usdt_balance FROM wallets WHERE user_id = $1',
        [userId]
      );

      const currentBalance = parseFloat(result.rows[0]?.usdt_balance || 0);
      const difference = usdtBalance - currentBalance;

      // If there's a positive difference, it's a deposit
      if (difference > 1) { // Minimum 1 USDT
        console.log(`💰 USDT deposit detected: ${difference} USDT`);
        await this.creditUserBalance(userId, 'USDT', difference, null);
      }
    } catch (error) {
      console.error('Error checking USDT deposit:', error);
    }
  }

  /**
   * Credit user balance
   */
  async creditUserBalance(userId, currency, amount, txHash) {
    try {
      console.log(`💳 Crediting ${amount} ${currency} to user ${userId}`);

      // Update wallet balance
      await Wallet.updateBalance(userId, currency, amount, 'add');

      // Mark deposit as credited
      if (txHash) {
        await query(
          `UPDATE deposit_requests 
           SET credited_at = NOW(), status = 'completed'
           WHERE transaction_hash = $1`,
          [txHash]
        );
      }

      console.log(`✅ Successfully credited ${amount} ${currency}`);
    } catch (error) {
      console.error('Error crediting user balance:', error);
    }
  }

  /**
   * Get deposit status
   */
  async getDepositStatus(txHash) {
    const result = await query(
      'SELECT * FROM deposit_requests WHERE transaction_hash = $1',
      [txHash]
    );
    
    return result.rows[0];
  }
}

module.exports = new BlockchainMonitorService();

