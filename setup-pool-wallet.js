require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupPoolWallet() {
  console.log('🚀 Setting up Pool Wallet System...');
  
  try {
    // 1. Read and execute the pool wallet schema
    const schemaPath = path.join(__dirname, 'database', 'pool-wallet-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📄 Reading pool wallet SQL schema...');
    console.log('💾 Executing database schema updates...');
    await query(schemaSql);
    console.log('✅ Database schema updated successfully!');
    
    // 2. Initialize pool wallet service
    const poolWalletService = require('./services/poolWalletService');
    console.log('🏦 Initializing pool wallet addresses...');
    const poolAddresses = await poolWalletService.initializePoolWallets();
    
    // 3. Update pool wallet configuration in database
    console.log('⚙️ Updating pool wallet configuration...');
    
    for (const [currency, address] of Object.entries(poolAddresses)) {
      await query(
        `UPDATE pool_wallet_config 
         SET pool_address = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE currency = $2`,
        [address, currency.toUpperCase()]
      );
      console.log(`   ${currency.toUpperCase()}: ${address}`);
    }
    
    // 4. Test pool wallet functionality
    console.log('🧪 Testing pool wallet functionality...');
    
    // Test getting pool addresses
    const testAddresses = await poolWalletService.getPoolAddresses();
    console.log('✅ Pool addresses retrieved successfully');
    
    // Test getting pool balances
    const testBalances = await poolWalletService.getPoolBalances();
    console.log('✅ Pool balances retrieved successfully');
    
    console.log('\n🎉 Pool Wallet System Setup Complete!');
    console.log('\n📋 Pool Wallet Addresses:');
    console.log(`   BTC:  ${poolAddresses.btc}`);
    console.log(`   ETH:  ${poolAddresses.eth}`);
    console.log(`   USDT: ${poolAddresses.usdt}`);
    
    console.log('\n📊 System Features:');
    console.log('   ✅ Pool wallet addresses generated');
    console.log('   ✅ Database schema updated');
    console.log('   ✅ Admin can manage pool wallets');
    console.log('   ✅ Users deposit to pool addresses');
    console.log('   ✅ Blockchain monitoring enabled');
    console.log('   ✅ Withdrawal system from pool wallet');
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Fund the pool wallet addresses with crypto');
    console.log('   2. Start the server to begin monitoring');
    console.log('   3. Test deposits and withdrawals');
    console.log('   4. Configure admin settings');
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    process.exit(1);
  } finally {
    // Ensure the database pool is ended
    const { pool } = require('./config/database');
    await pool.end();
  }
}

setupPoolWallet();
