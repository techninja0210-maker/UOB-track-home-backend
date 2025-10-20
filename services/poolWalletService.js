require('dotenv').config();
const bitcoin = require('bitcoinjs-lib');
const { BIP32Factory } = require('bip32');
const bip39 = require('bip39');
const { ethers } = require('ethers');
const crypto = require('crypto');
const ecc = require('tiny-secp256k1');

// Initialize BIP32 with ecc library
const bip32 = BIP32Factory(ecc);

class PoolWalletService {
  constructor() {
    // Ensure encryption key is exactly 32 bytes
    let encryptionKey = process.env.WALLET_ENCRYPTION_KEY || 'your-32-byte-encryption-key-change-this!!';
    if (encryptionKey.length !== 32) {
      console.warn('⚠️ WALLET_ENCRYPTION_KEY is not 32 bytes. Using a placeholder.');
      encryptionKey = 'your-32-byte-encryption-key-change-this!!'.padEnd(32, '0').slice(0, 32);
    }
    this.encryptionKey = encryptionKey;
    
    this.masterSeed = process.env.MASTER_WALLET_SEED || bip39.generateMnemonic(256);
    
    // Pool wallet addresses (generated once and reused for all users)
    this.poolAddresses = null;
    this.poolPrivateKeys = null;
  }

  /**
   * Generate pool wallet addresses (called once on startup)
   */
  async initializePoolWallets() {
    if (this.poolAddresses) {
      return this.poolAddresses; // Already initialized
    }

    try {
      console.log('🏦 Initializing pool wallet addresses...');
      
      // First, check if pool addresses already exist in database
      const { query } = require('../config/database');
      const existingAddresses = await query(`
        SELECT currency, address FROM pool_addresses 
        WHERE address IS NOT NULL AND address != ''
      `);
      
      if (existingAddresses.rows.length > 0) {
        console.log('📋 Found existing pool addresses in database:');
        this.poolAddresses = {};
        existingAddresses.rows.forEach(row => {
          this.poolAddresses[row.currency] = row.address;
          console.log(`   ${row.currency}: ${row.address}`);
        });
        console.log('✅ Using existing pool addresses from database');
        
        // Generate private keys for existing addresses (they should be deterministic)
        await this.generatePoolPrivateKeys();
        
        return this.poolAddresses;
      }
      
      console.log('🔄 No existing pool addresses found, generating new ones...');
      
      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(this.masterSeed);
      const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
      
      // Pool wallet derivation paths (fixed paths for pool wallets)
      const btcPath = `m/44'/0'/0'/0/0`;  // First pool wallet
      const ethPath = `m/44'/60'/0'/0/0`;  // First pool wallet for ETH
      
      // Generate BTC pool wallet
      const btcChild = root.derivePath(btcPath);
      const btcAddress = bitcoin.payments.p2pkh({
        pubkey: btcChild.publicKey,
        network: bitcoin.networks.bitcoin
      }).address;
      const btcPrivateKey = btcChild.toWIF();
      
      // Generate ETH pool wallet
      const ethChild = root.derivePath(ethPath);
      const ethPrivateKeyHex = ethChild.privateKey.toString('hex');
      const ethWallet = new ethers.Wallet(ethPrivateKeyHex);
      const ethAddress = ethWallet.address;
      const ethPrivateKey = ethWallet.privateKey;
      
      // Store pool addresses and encrypted private keys
      this.poolAddresses = {
        BTC: btcAddress,
        ETH: ethAddress,
        USDT: ethAddress  // USDT uses same address as ETH (ERC-20)
      };
      
      this.poolPrivateKeys = {
        btc: this.encrypt(btcPrivateKey),
        eth: this.encrypt(ethPrivateKey),
        usdt: this.encrypt(ethPrivateKey)  // Same private key for USDT
      };
      
      console.log('✅ Pool wallet addresses initialized:');
      console.log(`   BTC: ${btcAddress}`);
      console.log(`   ETH/USDT: ${ethAddress}`);
      
      // Save pool addresses to database
      await query(`
        INSERT INTO pool_addresses (currency, address, verified, verified_at)
        VALUES 
          ('BTC', $1, true, NOW()),
          ('ETH', $2, true, NOW()),
          ('USDT', $3, true, NOW())
        ON CONFLICT (currency) 
        DO UPDATE SET 
          address = EXCLUDED.address,
          verified = EXCLUDED.verified,
          verified_at = EXCLUDED.verified_at
      `, [btcAddress, ethAddress, ethAddress]);
      
      console.log('💾 Pool addresses saved to database');
      
      return this.poolAddresses;
    } catch (error) {
      console.error('❌ Error initializing pool wallets:', error);
      throw error;
    }
  }

  /**
   * Get pool wallet addresses (public addresses for deposits)
   */
  getPoolAddresses() {
    if (!this.poolAddresses) {
      throw new Error('Pool wallet addresses not initialized. Call initializePoolWallets first.');
    }
    return this.poolAddresses;
  }

  /**
   * Manually set/override a pool address (admin action)
   * NOTE: This is now deprecated in favor of automatic generation
   * Kept for backward compatibility but not recommended
   */
  async setPoolAddress(currency, address) {
    await this.initializePoolWallets();
    const cur = (currency || '').toLowerCase();
    if (!['btc', 'eth', 'usdt'].includes(cur)) {
      throw new Error('Unsupported currency');
    }
    // Basic format validation
    if (cur === 'eth' || cur === 'usdt') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Invalid EVM address format');
      }
    } else if (cur === 'btc') {
      // Very light validation for base58/bech32 (starts with 1,3,bc1)
      if (!/^([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[0-9a-zA-Z]{11,71})$/.test(address)) {
        throw new Error('Invalid BTC address format');
      }
    }
    console.warn(`⚠️ Manual pool address override for ${currency}. Consider using automatic generation instead.`);
    this.poolAddresses[cur] = address;
    return this.poolAddresses;
  }

  /**
   * Generate private keys for existing pool addresses (deterministic)
   */
  async generatePoolPrivateKeys() {
    try {
      console.log('🔑 Generating private keys for existing pool addresses...');
      
      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(this.masterSeed);
      const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
      
      // Pool wallet derivation paths (same as in initializePoolWallets)
      const btcPath = `m/44'/0'/0'/0/0`;  // First pool wallet
      const ethPath = `m/44'/60'/0'/0/0`;  // First pool wallet for ETH
      
      // Generate BTC private key
      const btcChild = root.derivePath(btcPath);
      const btcPrivateKey = btcChild.toWIF();
      
      // Generate ETH private key
      const ethChild = root.derivePath(ethPath);
      const ethPrivateKeyHex = ethChild.privateKey.toString('hex');
      const ethWallet = new ethers.Wallet(ethPrivateKeyHex);
      const ethPrivateKey = ethWallet.privateKey;
      
      // Verify that generated addresses match database addresses
      const generatedBtcAddress = bitcoin.payments.p2pkh({
        pubkey: btcChild.publicKey,
        network: bitcoin.networks.bitcoin
      }).address;
      
      const generatedEthAddress = ethWallet.address;
      
      console.log('🔍 Address verification:');
      console.log('Generated BTC:', generatedBtcAddress);
      console.log('Database BTC:', this.poolAddresses.BTC);
      console.log('Generated ETH:', generatedEthAddress);
      console.log('Database ETH:', this.poolAddresses.ETH);
      
      if (generatedBtcAddress !== this.poolAddresses.BTC) {
        console.warn('⚠️ Generated BTC address does not match database address');
        console.log('💡 BTC withdrawals will not work until private key is manually set');
      }
      
      if (generatedEthAddress !== this.poolAddresses.ETH) {
        console.warn('⚠️ Generated ETH address does not match database address');
        console.log('🔄 This means the database address was manually set or from a different seed');
        console.log('💡 ETH/USDT withdrawals will not work until private key is manually set');
        console.log('💡 To fix: Set the private key for the existing address manually');
      }
      
      // Store encrypted private keys (even if they don't match - for future use)
      this.poolPrivateKeys = {
        btc: this.encrypt(btcPrivateKey),
        eth: this.encrypt(ethPrivateKey),
        usdt: this.encrypt(ethPrivateKey)  // Same private key for USDT
      };
      
      console.log('✅ Private keys generated and encrypted');
      console.log('⚠️  Note: Private keys may not match existing addresses - manual setup required');
    } catch (error) {
      console.error('❌ Error generating private keys:', error);
      throw error;
    }
  }

  /**
   * Manually set private key for an existing pool address
   * This is needed when the address was created outside the deterministic system
   */
  async setPoolPrivateKey(currency, privateKey) {
    try {
      console.log(`🔑 Setting manual private key for ${currency}...`);
      
      // Validate the private key matches the address
      const address = this.poolAddresses[currency.toUpperCase()];
      if (!address) {
        throw new Error(`No address found for currency: ${currency}`);
      }
      
      if (currency.toLowerCase() === 'eth' || currency.toLowerCase() === 'usdt') {
        // For ETH/USDT, validate the private key generates the correct address
        const wallet = new ethers.Wallet(privateKey);
        if (wallet.address.toLowerCase() !== address.toLowerCase()) {
          throw new Error(`Private key does not match ${currency} address. Expected: ${address}, Got: ${wallet.address}`);
        }
        console.log(`✅ ETH private key validated for address: ${wallet.address}`);
      } else if (currency.toLowerCase() === 'btc') {
        // For BTC, validate the private key generates the correct address
        const keyPair = bitcoin.ECPair.fromWIF(privateKey);
        const btcAddress = bitcoin.payments.p2pkh({
          pubkey: keyPair.publicKey,
          network: bitcoin.networks.bitcoin
        }).address;
        if (btcAddress !== address) {
          throw new Error(`Private key does not match BTC address. Expected: ${address}, Got: ${btcAddress}`);
        }
        console.log(`✅ BTC private key validated for address: ${btcAddress}`);
      }
      
      // Store the encrypted private key
      if (!this.poolPrivateKeys) {
        this.poolPrivateKeys = {};
      }
      
      this.poolPrivateKeys[currency.toLowerCase()] = this.encrypt(privateKey);
      
      console.log(`✅ Private key set and encrypted for ${currency}`);
      return true;
    } catch (error) {
      console.error(`❌ Error setting private key for ${currency}:`, error.message);
      throw error;
    }
  }

  /**
   * Get decrypted private key for signing transactions
   */
  async getPoolPrivateKey(currency) {
    if (!this.poolPrivateKeys) {
      await this.initializePoolWallets();
    }
    
    const encryptedKey = this.poolPrivateKeys[currency.toLowerCase()];
    if (!encryptedKey) {
      throw new Error(`No private key found for currency: ${currency}. Use setPoolPrivateKey() to set it manually.`);
    }
    
    const privateKey = this.decrypt(encryptedKey);
    
    // Verify the private key matches the database address
    const databaseAddress = this.poolAddresses[currency.toUpperCase()];
    if (currency.toLowerCase() === 'eth' || currency.toLowerCase() === 'usdt') {
      const wallet = new ethers.Wallet(privateKey);
      if (wallet.address.toLowerCase() !== databaseAddress.toLowerCase()) {
        console.error(`❌ Private key mismatch for ${currency}:`);
        console.error(`   Database address: ${databaseAddress}`);
        console.error(`   Private key address: ${wallet.address}`);
        throw new Error(`Private key does not match ${currency} database address. Use setPoolPrivateKey() to set the correct private key.`);
      }
    }
    
    return privateKey;
  }

  /**
   * Generate user deposit address (unique for each user, but transactions go to pool)
   */
  async getUserDepositAddress(userId, currency) {
    // Generate unique address for user display
    const seed = await bip39.mnemonicToSeed(this.masterSeed + userId);
    const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
    
    if (currency.toLowerCase() === 'btc') {
      const accountIndex = this.hashUserIdToNumber(userId);
      const path = `m/44'/0'/${accountIndex}'/0/0`;
      const child = root.derivePath(path);
      const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.bitcoin
      });
      return address;
    } else if (currency.toLowerCase() === 'eth' || currency.toLowerCase() === 'usdt') {
      const accountIndex = this.hashUserIdToNumber(userId);
      const path = `m/44'/60'/${accountIndex}'/0/0`;
      const child = root.derivePath(path);
      const wallet = new ethers.Wallet(child.privateKey.toString('hex'));
      return wallet.address;
    }
    
    throw new Error(`Unsupported currency: ${currency}`);
  }

  /**
   * Hash userId to get deterministic account index (limited to valid range)
   */
  hashUserIdToNumber(userId) {
    const hash = require('crypto').createHash('sha256').update(userId).digest('hex');
    // Limit to valid UInt31 range (0 to 2147483647)
    return parseInt(hash.substring(0, 7), 16) % 1000000; // Use smaller range for safety
  }

  /**
   * Check if an address belongs to the pool wallet
   */
  async isPoolAddress(address, currency) {
    const poolAddresses = await this.getPoolAddresses();
    return poolAddresses[currency.toLowerCase()] === address;
  }

  /**
   * Encrypt private key
   */
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  /**
   * Decrypt private key
   */
  decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  /**
   * Get pool wallet balances (for admin monitoring)
   */
  async getPoolBalances() {
    const addresses = await this.getPoolAddresses();
    
    try {
      // Use Sepolia testnet RPC (fallback if ETH_RPC_URL is not set or invalid)
      const rpcUrl = process.env.ETH_RPC_URL || 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Get ETH balance
      const ethBalance = await provider.getBalance(addresses.ETH);
      const ethBalanceFormatted = parseFloat(ethers.formatEther(ethBalance));
      
      // Get USDT balance (ERC-20) - Use Sepolia testnet USDT contract
      const usdtContractAddress = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'; // Sepolia USDT
      const usdtAbi = ["function balanceOf(address owner) view returns (uint256)"];
      const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, provider);
      const usdtBalance = await usdtContract.balanceOf(addresses.USDT);
      const usdtBalanceFormatted = parseFloat(ethers.formatUnits(usdtBalance, 6)); // USDT has 6 decimals
      
      // For BTC, we'd need a Bitcoin API - for now return 0
      // In production, you'd use a service like BlockCypher, Blockstream, or your own Bitcoin node
      const btcBalance = 0; // TODO: Implement Bitcoin balance checking
      
      console.log('✅ Pool balances fetched successfully:');
      console.log(`   ETH: ${ethBalanceFormatted} ETH`);
      console.log(`   USDT: ${usdtBalanceFormatted} USDT`);
      console.log(`   BTC: ${btcBalance} BTC (not implemented)`);
      
      return {
        BTC: {
          address: addresses.BTC,
          balance: btcBalance,
          pending: 0
        },
        ETH: {
          address: addresses.ETH,
          balance: ethBalanceFormatted,
          pending: 0
        },
        USDT: {
          address: addresses.USDT,
          balance: usdtBalanceFormatted,
          pending: 0
        }
      };
    } catch (error) {
      console.error('❌ Error fetching pool balances:', error.message);
      // Return zero balances on error
      return {
        BTC: {
          address: addresses.BTC,
          balance: 0,
          pending: 0
        },
        ETH: {
          address: addresses.ETH,
          balance: 0,
          pending: 0
        },
        USDT: {
          address: addresses.USDT,
          balance: 0,
          pending: 0
        }
      };
    }
  }

  /**
   * Send crypto from pool wallet (for withdrawals)
   */
  async sendFromPool(currency, toAddress, amount) {
    console.log(`🚀 Starting pool withdrawal: ${amount} ${currency} to ${toAddress}`);
    
    // Validate inputs
    if (!currency || !toAddress || !amount) {
      throw new Error('Missing required parameters: currency, toAddress, amount');
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Check pool balance first
    const balances = await this.getPoolBalances();
    const poolBalance = balances[currency.toUpperCase()]?.balance || 0;
    
    if (poolBalance < amount) {
      throw new Error(`Insufficient pool balance. Available: ${poolBalance} ${currency}, Requested: ${amount} ${currency}`);
    }
    
    console.log(`✅ Pool balance check passed: ${poolBalance} ${currency} available`);
    
    const privateKey = await this.getPoolPrivateKey(currency);
    
    let txHash;
    if (currency.toLowerCase() === 'btc') {
      txHash = await this.sendBTC(privateKey, toAddress, amount);
    } else if (currency.toLowerCase() === 'eth') {
      txHash = await this.sendETH(privateKey, toAddress, amount);
    } else if (currency.toLowerCase() === 'usdt') {
      txHash = await this.sendUSDT(privateKey, toAddress, amount);
    } else {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    
    // Log the withdrawal transaction
    await this.logWithdrawalTransaction(currency, toAddress, amount, txHash);
    
    console.log(`✅ Pool withdrawal completed: ${txHash}`);
    return txHash;
  }

  /**
   * Send Bitcoin from pool wallet
   */
  async sendBTC(privateKeyWIF, toAddress, amountBtc) {
    // Implementation would be similar to withdrawalService.js
    // This is a placeholder - you'd need to implement UTXO management
    console.log(`📤 Sending ${amountBtc} BTC from pool to ${toAddress}`);
    
    // For now, return a placeholder transaction hash
    return 'pool-btc-tx-' + Date.now();
  }

  /**
   * Send Ethereum from pool wallet
   */
  async sendETH(privateKey, toAddress, amount) {
    try {
      // Use Sepolia testnet RPC (fallback if ETH_RPC_URL is not set or invalid)
      const rpcUrl = process.env.ETH_RPC_URL || 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      console.log(`💰 Sending ${amount} ETH from ${wallet.address} to ${toAddress}`);
      
      // Validate and normalize address
      let normalizedAddress;
      try {
        normalizedAddress = ethers.getAddress(toAddress);
      } catch (error) {
        // If checksum is wrong, try to fix it
        if (error.code === 'INVALID_ARGUMENT' && error.argument === 'address') {
          try {
            // Convert to lowercase and try again
            normalizedAddress = ethers.getAddress(toAddress.toLowerCase());
          } catch (e) {
            throw new Error(`Invalid Ethereum address format: ${toAddress}`);
          }
        } else {
          throw new Error(`Invalid Ethereum address: ${toAddress}`);
        }
      }
      
      // Estimate gas limit
      const gasEstimate = await provider.estimateGas({
        from: wallet.address,
        to: normalizedAddress,
        value: ethers.parseEther(amount.toString())
      });
      
      const tx = {
        to: normalizedAddress,
        value: ethers.parseEther(amount.toString()),
        gasLimit: gasEstimate * 120n / 100n, // Add 20% buffer
      };
      
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}, Using: ${tx.gasLimit.toString()}`);
      
      const response = await wallet.sendTransaction(tx);
      console.log(`📤 ETH transaction sent: ${response.hash}`);
      
      return response.hash;
    } catch (error) {
      console.error('❌ ETH send error:', error);
      throw new Error(`Failed to send ETH: ${error.message}`);
    }
  }

  /**
   * Send USDT from pool wallet
   */
  async sendUSDT(privateKey, toAddress, amount) {
    try {
      // Use Sepolia testnet RPC (fallback if ETH_RPC_URL is not set or invalid)
      const rpcUrl = process.env.ETH_RPC_URL || 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Use Sepolia testnet USDT contract
      const usdtContractAddress = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'; // Sepolia USDT
      const usdtAbi = ["function transfer(address to, uint256 amount)"];
      const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, wallet);
      
      console.log(`💰 Sending ${amount} USDT from ${wallet.address} to ${toAddress}`);
      
      // Validate and normalize address
      let normalizedAddress;
      try {
        normalizedAddress = ethers.getAddress(toAddress);
      } catch (error) {
        // If checksum is wrong, try to fix it
        if (error.code === 'INVALID_ARGUMENT' && error.argument === 'address') {
          try {
            // Convert to lowercase and try again
            normalizedAddress = ethers.getAddress(toAddress.toLowerCase());
          } catch (e) {
            throw new Error(`Invalid Ethereum address format: ${toAddress}`);
          }
        } else {
          throw new Error(`Invalid Ethereum address: ${toAddress}`);
        }
      }
      
      const amountUsdt = ethers.parseUnits(amount.toString(), 6); // USDT has 6 decimals
      
      // Estimate gas for USDT transfer
      const gasEstimate = await usdtContract.transfer.estimateGas(normalizedAddress, amountUsdt);
      
      const tx = await usdtContract.transfer(normalizedAddress, amountUsdt, {
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      });
      
      console.log(`📤 USDT transaction sent: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error('❌ USDT send error:', error);
      throw new Error(`Failed to send USDT: ${error.message}`);
    }
  }

  /**
   * Log withdrawal transaction to database
   */
  async logWithdrawalTransaction(currency, toAddress, amount, txHash) {
    try {
      const { query } = require('../config/database');
      
      await query(`
        INSERT INTO transactions_ledger (
          user_id, type, currency, amount, from_address, to_address, 
          transaction_hash, status, created_at
        ) VALUES (
          'admin', 'admin_withdrawal', $1, $2, 
          (SELECT address FROM pool_addresses WHERE currency = $1), 
          $3, $4, 'completed', NOW()
        )
      `, [currency.toUpperCase(), amount, toAddress, txHash]);
      
      console.log(`📝 Withdrawal transaction logged: ${txHash}`);
    } catch (error) {
      console.error('❌ Error logging withdrawal transaction:', error);
      // Don't throw error here as the transaction was already sent
    }
  }
}

module.exports = new PoolWalletService();
