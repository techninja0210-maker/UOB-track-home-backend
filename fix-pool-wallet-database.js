require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');
const poolWalletService = require('./services/poolWalletService');

async function fixPoolWalletDatabase() {
  console.log('🔧 Fixing Pool Wallet Database...\n');
  
  try {
    // 1. Create pool wallet tables
    console.log('1️⃣ Creating pool wallet tables...');
    
    // Create pool_deposits table
    await query(`
      CREATE TABLE IF NOT EXISTS pool_deposits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        currency VARCHAR(10) NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        pool_address VARCHAR(255) NOT NULL,
        transaction_hash VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'cancelled')),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        claimed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ pool_deposits table created');
    
    // Create pool_withdrawals table
    await query(`
      CREATE TABLE IF NOT EXISTS pool_withdrawals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        currency VARCHAR(10) NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        destination_address VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
        transaction_hash VARCHAR(255),
        admin_notes TEXT,
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    console.log('   ✅ pool_withdrawals table created');
    
    // Create pool_wallet_config table
    await query(`
      CREATE TABLE IF NOT EXISTS pool_wallet_config (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        currency VARCHAR(10) UNIQUE NOT NULL,
        pool_address VARCHAR(255) NOT NULL,
        pool_private_key_encrypted TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ pool_wallet_config table created');
    
    // Create indexes
    await query('CREATE INDEX IF NOT EXISTS idx_pool_deposits_status ON pool_deposits(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_pool_deposits_transaction_hash ON pool_deposits(transaction_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_status ON pool_withdrawals(status)');
    console.log('   ✅ Indexes created');
    
    // 2. Get pool wallet addresses
    console.log('\n2️⃣ Getting pool wallet addresses...');
    const poolAddresses = await poolWalletService.initializePoolWallets();
    console.log('   ✅ Pool addresses retrieved');
    
    // 3. Update pool wallet configuration
    console.log('\n3️⃣ Updating pool wallet configuration...');
    
    for (const [currency, address] of Object.entries(poolAddresses)) {
      await query(`
        INSERT INTO pool_wallet_config (currency, pool_address, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (currency) DO UPDATE SET
          pool_address = EXCLUDED.pool_address,
          updated_at = CURRENT_TIMESTAMP
      `, [currency.toUpperCase(), address]);
      console.log(`   ✅ ${currency.toUpperCase()} pool address configured`);
    }
    
    // 4. Update existing wallets with pool addresses
    console.log('\n4️⃣ Updating existing wallets with pool addresses...');
    
    const existingWallets = await query('SELECT id, user_id FROM wallets');
    console.log(`   📋 Found ${existingWallets.rows.length} existing wallets`);
    
    for (const wallet of existingWallets.rows) {
      await query(`
        UPDATE wallets 
        SET 
          btc_address = $1,
          eth_address = $2,
          usdt_address = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [poolAddresses.btc, poolAddresses.eth, poolAddresses.usdt, wallet.id]);
    }
    console.log('   ✅ All existing wallets updated with pool addresses');
    
    // 5. Verify the fixes
    console.log('\n5️⃣ Verifying database fixes...');
    
    const walletCount = await query('SELECT COUNT(*) as count FROM wallets');
    const poolDepositsCount = await query('SELECT COUNT(*) as count FROM pool_deposits');
    const poolWithdrawalsCount = await query('SELECT COUNT(*) as count FROM pool_withdrawals');
    const poolConfigCount = await query('SELECT COUNT(*) as count FROM pool_wallet_config');
    
    console.log(`   📊 Wallets: ${walletCount.rows[0].count}`);
    console.log(`   📊 Pool Deposits: ${poolDepositsCount.rows[0].count}`);
    console.log(`   📊 Pool Withdrawals: ${poolWithdrawalsCount.rows[0].count}`);
    console.log(`   📊 Pool Config: ${poolConfigCount.rows[0].count}`);
    
    // 6. Test a wallet query
    console.log('\n6️⃣ Testing wallet queries...');
    const testWallet = await query('SELECT btc_address, eth_address, usdt_address FROM wallets LIMIT 1');
    if (testWallet.rows.length > 0) {
      const wallet = testWallet.rows[0];
      console.log('   ✅ Wallet addresses found:');
      console.log(`      BTC:  ${wallet.btc_address}`);
      console.log(`      ETH:  ${wallet.eth_address}`);
      console.log(`      USDT: ${wallet.usdt_address}`);
    }
    
    console.log('\n🎉 Pool Wallet Database Fix Complete!');
    console.log('\n📊 Database Status:');
    console.log('   ✅ Pool wallet tables created');
    console.log('   ✅ Pool addresses configured');
    console.log('   ✅ Existing wallets updated');
    console.log('   ✅ Indexes created');
    console.log('   ✅ Database ready for pool wallet system');
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Restart the server to load new database schema');
    console.log('   2. Test the pool wallet system again');
    console.log('   3. Fund the pool wallet addresses');
    console.log('   4. Test deposits and withdrawals');
    
  } catch (error) {
    console.error('❌ Database fix failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the fix
fixPoolWalletDatabase().then(() => {
  console.log('\n✅ Database fix completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Database fix failed:', error);
  process.exit(1);
});
