const crypto = require('crypto');
const bip39 = require('bip39');

console.log('🔐 Generating secure wallet keys...\n');

// Generate 32-byte encryption key
const encryptionKey = crypto.randomBytes(32).toString('hex');
console.log('WALLET_ENCRYPTION_KEY=' + encryptionKey);

// Generate 256-bit mnemonic (24 words)
const masterSeed = bip39.generateMnemonic(256);
console.log('MASTER_WALLET_SEED=' + masterSeed);

console.log('\n✅ Copy these values to your backend/.env file');
console.log('⚠️  IMPORTANT: Keep these keys secure and never share them!');
