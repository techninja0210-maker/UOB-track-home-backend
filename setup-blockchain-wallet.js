require('dotenv').config();
const { pool, query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupBlockchainWallet() {
  console.log('🚀 Setting up Blockchain Wallet System...\n');

  try {
    // Read and execute SQL file
    console.log('📄 Reading SQL schema...');
    const sqlPath = path.join(__dirname, 'database', 'add-wallet-addresses.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('💾 Executing database schema updates...');
    await query(sql);

    console.log('✅ Database schema updated successfully!\n');

    // Apply pool tables schema
    try {
      const poolSqlPath = path.join(__dirname, 'database', 'add-pool-tables.sql');
      if (fs.existsSync(poolSqlPath)) {
        console.log('📄 Reading pool tables SQL...');
        const poolSql = fs.readFileSync(poolSqlPath, 'utf8');
        console.log('💾 Executing pool tables schema updates...');
        await query(poolSql);
        console.log('✅ Pool tables updated successfully!\n');
      }
    } catch (poolErr) {
      console.warn('⚠️ Pool tables schema update skipped:', poolErr.message);
    }

    // Apply alignment migration for pool model
    try {
      const alignSqlPath = path.join(__dirname, 'database', '2025-10-align-pool-model.sql');
      if (fs.existsSync(alignSqlPath)) {
        console.log('📄 Reading pool alignment SQL...');
        const alignSql = fs.readFileSync(alignSqlPath, 'utf8');
        console.log('💾 Executing alignment schema updates...');
        await query(alignSql);
        console.log('✅ Alignment migration applied!\n');
      }
    } catch (alignErr) {
      console.warn('⚠️ Alignment migration skipped:', alignErr.message);
    }

    // Check if any wallets exist that need addresses
    console.log('🔍 Checking existing wallets...');
    const walletsResult = await query(
      'SELECT id, user_id FROM wallets WHERE btc_address IS NULL'
    );

    if (walletsResult.rows.length > 0) {
      console.log(`📝 Found ${walletsResult.rows.length} wallets without addresses`);
      console.log('⚠️  Run the server to automatically generate addresses for existing users');
    } else {
      console.log('✅ No existing wallets need address generation');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Blockchain Wallet System Setup Complete!');
    console.log('='.repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('1. ✅ Update your .env file with:');
    console.log('   - WALLET_ENCRYPTION_KEY (32-byte secure string)');
    console.log('   - MASTER_WALLET_SEED (24-word BIP39 mnemonic)');
    console.log('   - ETH_RPC_URL (Infura or Alchemy URL)');
    console.log('\n2. ✅ Generate a secure mnemonic at: https://iancoleman.io/bip39/');
    console.log('\n3. ✅ Get a free Infura account at: https://infura.io');
    console.log('\n4. ✅ Start the server: npm run dev');
    console.log('\n5. ✅ Blockchain monitoring will start automatically');
    console.log('\n⚠️  IMPORTANT: Keep your WALLET_ENCRYPTION_KEY and MASTER_WALLET_SEED secure!');
    console.log('   These are critical for wallet security.\n');

  } catch (error) {
    console.error('❌ Setup error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupBlockchainWallet();

