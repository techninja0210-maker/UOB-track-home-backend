require('dotenv').config({ path: './.env' });
const poolWalletService = require('./services/poolWalletService');

async function testPoolWallet() {
  console.log('🧪 Testing Pool Wallet System...');
  
  try {
    // Test pool wallet initialization
    console.log('🏦 Initializing pool wallet addresses...');
    const poolAddresses = await poolWalletService.initializePoolWallets();
    
    console.log('✅ Pool wallet addresses initialized:');
    console.log(`   BTC:  ${poolAddresses.btc}`);
    console.log(`   ETH:  ${poolAddresses.eth}`);
    console.log(`   USDT: ${poolAddresses.usdt}`);
    
    // Test getting pool addresses
    console.log('\n📋 Testing pool address retrieval...');
    const testAddresses = await poolWalletService.getPoolAddresses();
    console.log('✅ Pool addresses retrieved successfully');
    
    // Test getting pool balances
    console.log('\n💰 Testing pool balance retrieval...');
    const testBalances = await poolWalletService.getPoolBalances();
    console.log('✅ Pool balances retrieved successfully');
    console.log('   Balances:', testBalances);
    
    console.log('\n🎉 Pool Wallet System Test Complete!');
    console.log('\n📊 System Status:');
    console.log('   ✅ Pool wallet addresses generated');
    console.log('   ✅ Address retrieval working');
    console.log('   ✅ Balance retrieval working');
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Update database schema manually if needed');
    console.log('   2. Start the server to begin monitoring');
    console.log('   3. Fund the pool wallet addresses');
    console.log('   4. Test deposits and withdrawals');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testPoolWallet();
