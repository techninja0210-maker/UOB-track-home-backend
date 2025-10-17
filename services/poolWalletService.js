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
        btc: btcAddress,
        eth: ethAddress,
        usdt: ethAddress  // USDT uses same address as ETH (ERC-20)
      };
      
      this.poolPrivateKeys = {
        btc: this.encrypt(btcPrivateKey),
        eth: this.encrypt(ethPrivateKey),
        usdt: this.encrypt(ethPrivateKey)  // Same private key for USDT
      };
      
      console.log('✅ Pool wallet addresses initialized:');
      console.log(`   BTC: ${btcAddress}`);
      console.log(`   ETH/USDT: ${ethAddress}`);
      
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
    this.poolAddresses[cur] = address;
    return this.poolAddresses;
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
      throw new Error(`No private key found for currency: ${currency}`);
    }
    
    return this.decrypt(encryptedKey);
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
    
    // This would typically query blockchain APIs to get actual balances
    // For now, return placeholder structure
    return {
      btc: {
        address: addresses.btc,
        balance: 0, // Would query Bitcoin API
        pending: 0
      },
      eth: {
        address: addresses.eth,
        balance: 0, // Would query Ethereum API
        pending: 0
      },
      usdt: {
        address: addresses.usdt,
        balance: 0, // Would query USDT contract
        pending: 0
      }
    };
  }

  /**
   * Send crypto from pool wallet (for withdrawals)
   */
  async sendFromPool(currency, toAddress, amount) {
    const privateKey = await this.getPoolPrivateKey(currency);
    
    if (currency.toLowerCase() === 'btc') {
      return await this.sendBTC(privateKey, toAddress, amount);
    } else if (currency.toLowerCase() === 'eth') {
      return await this.sendETH(privateKey, toAddress, amount);
    } else if (currency.toLowerCase() === 'usdt') {
      return await this.sendUSDT(privateKey, toAddress, amount);
    } else {
      throw new Error(`Unsupported currency: ${currency}`);
    }
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
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const tx = {
      to: toAddress,
      value: ethers.parseEther(amount.toString()),
      gasLimit: 21000,
    };
    
    const response = await wallet.sendTransaction(tx);
    return response.hash;
  }

  /**
   * Send USDT from pool wallet
   */
  async sendUSDT(privateKey, toAddress, amount) {
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    const usdtAbi = ["function transfer(address to, uint256 amount)"];
    const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, wallet);
    
    const amountUsdt = ethers.parseUnits(amount.toString(), 6); // USDT has 6 decimals
    
    const tx = await usdtContract.transfer(toAddress, amountUsdt);
    return tx.hash;
  }
}

module.exports = new PoolWalletService();
