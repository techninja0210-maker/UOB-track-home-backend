require('dotenv').config();
const { query } = require('./config/database');

async function migrateToPoolModel() {
  console.log('🔄 Migrating to Pool Wallet Model...\n');

  try {
    // 1. Create pool_deposits table if it doesn't exist
    console.log('📄 Creating pool_deposits table...');
    await query(`
      CREATE TABLE IF NOT EXISTS pool_deposits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        currency VARCHAR(10) NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        pool_address VARCHAR(255) NOT NULL,
        transaction_hash VARCHAR(255) UNIQUE,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
        sender_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ pool_deposits table ready');

    // 2. Add address columns to wallets if they don't exist
    console.log('📄 Adding address columns to wallets...');
    
    const columns = ['btc_address', 'eth_address', 'usdt_address'];
    for (const column of columns) {
      try {
        await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ${column} VARCHAR(255);`);
        console.log(`✅ Added ${column} column`);
      } catch (err) {
        console.log(`⚠️ ${column} column already exists or error: ${err.message}`);
      }
    }

    // 3. Remove private key columns if they exist (pool model doesn't use them)
    console.log('📄 Removing private key columns (pool model)...');
    
    const privateKeyColumns = ['btc_private_key_encrypted', 'eth_private_key_encrypted'];
    for (const column of privateKeyColumns) {
      try {
        await query(`ALTER TABLE wallets DROP COLUMN IF EXISTS ${column};`);
        console.log(`✅ Removed ${column} column`);
      } catch (err) {
        console.log(`⚠️ ${column} column removal skipped: ${err.message}`);
      }
    }

    // 4. Update deposit_requests and withdrawal_requests defaults
    console.log('📄 Updating request table defaults...');
    try {
      await query(`ALTER TABLE deposit_requests ALTER COLUMN status SET DEFAULT 'pending';`);
      console.log('✅ Updated deposit_requests default');
    } catch (err) {
      console.log(`⚠️ deposit_requests update skipped: ${err.message}`);
    }

    try {
      await query(`ALTER TABLE withdrawal_requests ALTER COLUMN status SET DEFAULT 'pending';`);
      console.log('✅ Updated withdrawal_requests default');
    } catch (err) {
      console.log(`⚠️ withdrawal_requests update skipped: ${err.message}`);
    }

    console.log('\n🎉 Migration to Pool Model Complete!');
    console.log('\n📋 What was done:');
    console.log('✅ Created pool_deposits table for pool wallet tracking');
    console.log('✅ Added display address columns to wallets');
    console.log('✅ Removed private key columns (pool model)');
    console.log('✅ Updated request table defaults');
    
    console.log('\n🚀 Ready to use pool wallet model!');
    console.log('   - Users deposit to pool addresses');
    console.log('   - Balances are off-chain numbers');
    console.log('   - Gold buy/sell is off-chain');
    console.log('   - Withdrawals trigger on-chain transfers');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    // Close the database connection
    const { pool } = require('./config/database');
    await pool.end();
  }
}

// Run migration
migrateToPoolModel();
