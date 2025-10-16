const bitcoin = require('bitcoinjs-lib');
const { BIP32Factory } = require('bip32');
const bip39 = require('bip39');
const { ethers } = require('ethers');
const crypto = require('crypto');
const ecc = require('tiny-secp256k1');

// Initialize BIP32 with ecc library
const bip32 = BIP32Factory(ecc);

class WalletAddressService {
  constructor() {
    // Encryption key (should be stored securely, preferably in environment variable)
    this.encryptionKey = process.env.WALLET_ENCRYPTION_KEY || 'your-32-byte-encryption-key-change-this!!';
    this.encryptionAlgorithm = 'aes-256-cbc';
    
    // Master seed for deterministic wallet generation (HD Wallet)
    this.masterSeed = process.env.MASTER_WALLET_SEED || bip39.generateMnemonic(256);
  }

  /**
   * Generate Bitcoin address for user
   * @param {string} userId - User UUID
   * @returns {Object} {address, privateKey}
   */
  async generateBTCAddress(userId) {
    try {
      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(this.masterSeed);
      
      // Create HD wallet root
      const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
      
      // Derive path for this user (BIP44: m/44'/0'/account'/0/index)
      // Using userId hash as account number for deterministic generation
      const accountIndex = this.hashUserIdToNumber(userId);
      const path = `m/44'/0'/${accountIndex}'/0/0`;
      const child = root.derivePath(path);
      
      // Generate P2PKH (Pay to Public Key Hash) address
      const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.bitcoin
      });
      
      // Get private key WIF format
      const privateKey = child.toWIF();
      
      return {
        address,
        privateKey,
        derivationPath: path
      };
    } catch (error) {
      console.error('BTC address generation error:', error);
      throw new Error('Failed to generate Bitcoin address');
    }
  }

  /**
   * Generate Ethereum/USDT address for user (same address for both)
   * @param {string} userId - User UUID
   * @returns {Object} {address, privateKey}
   */
  async generateETHAddress(userId) {
    try {
      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(this.masterSeed);
      
      // Create HD wallet for Ethereum (BIP44: m/44'/60'/account'/0/0)
      const accountIndex = this.hashUserIdToNumber(userId);
      const path = `m/44'/60'/${accountIndex}'/0/0`;
      
      const hdNode = ethers.HDNodeWallet.fromSeed(seed);
      const childNode = hdNode.derivePath(path);
      
      return {
        address: childNode.address,
        privateKey: childNode.privateKey,
        derivationPath: path
      };
    } catch (error) {
      console.error('ETH address generation error:', error);
      throw new Error('Failed to generate Ethereum address');
    }
  }

  /**
   * Generate all addresses for a user
   * @param {string} userId - User UUID
   * @returns {Object} All addresses and encrypted private keys
   */
  async generateAllAddresses(userId) {
    const btcWallet = await this.generateBTCAddress(userId);
    const ethWallet = await this.generateETHAddress(userId);
    
    return {
      btc: {
        address: btcWallet.address,
        privateKeyEncrypted: this.encrypt(btcWallet.privateKey),
        derivationPath: btcWallet.derivationPath
      },
      eth: {
        address: ethWallet.address,
        privateKeyEncrypted: this.encrypt(ethWallet.privateKey),
        derivationPath: ethWallet.derivationPath
      },
      usdt: {
        address: ethWallet.address, // USDT uses same address as ETH (ERC-20)
        privateKeyEncrypted: this.encrypt(ethWallet.privateKey),
        derivationPath: ethWallet.derivationPath
      }
    };
  }

  /**
   * Encrypt private key
   * @param {string} text - Private key to encrypt
   * @returns {string} Encrypted private key
   */
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt private key
   * @param {string} encryptedText - Encrypted private key
   * @returns {string} Decrypted private key
   */
  decrypt(encryptedText) {
    try {
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, key, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt private key');
    }
  }

  /**
   * Hash userId to a consistent number for derivation path
   * @param {string} userId - User UUID
   * @returns {number} Account index
   */
  hashUserIdToNumber(userId) {
    const hash = crypto.createHash('sha256').update(userId).digest();
    // Use first 4 bytes and convert to number (mod to keep it reasonable)
    return hash.readUInt32BE(0) % 1000000;
  }

  /**
   * Validate Bitcoin address
   * @param {string} address - Bitcoin address
   * @returns {boolean} Is valid
   */
  isValidBTCAddress(address) {
    try {
      bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate Ethereum address
   * @param {string} address - Ethereum address
   * @returns {boolean} Is valid
   */
  isValidETHAddress(address) {
    return ethers.isAddress(address);
  }

  /**
   * Generate master wallet for platform
   * @param {string} currency - BTC, ETH, or USDT
   * @returns {Object} Master wallet credentials
   */
  async generateMasterWallet(currency) {
    if (currency === 'BTC') {
      // Generate random Bitcoin wallet for platform
      const seed = await bip39.mnemonicToSeed(bip39.generateMnemonic(256));
      const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
      const path = "m/44'/0'/0'/0/0";
      const child = root.derivePath(path);
      
      const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.bitcoin
      });
      
      return {
        address,
        privateKeyEncrypted: this.encrypt(child.toWIF()),
        currency: 'BTC'
      };
    } else {
      // Generate random Ethereum wallet for platform
      const wallet = ethers.Wallet.createRandom();
      
      return {
        address: wallet.address,
        privateKeyEncrypted: this.encrypt(wallet.privateKey),
        currency
      };
    }
  }
}

module.exports = new WalletAddressService();

