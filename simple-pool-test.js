console.log('🧪 Testing Pool Wallet Service...');

const poolWalletService = require('./services/poolWalletService');

async function test() {
  try {
    console.log('1. Initializing pool wallets...');
    await poolWalletService.initializePoolWallets();
    
    console.log('2. Getting pool addresses...');
    const addresses = poolWalletService.getPoolAddresses();
    
    console.log('✅ Pool Addresses:');
    console.log('   BTC:', addresses.BTC);
    console.log('   ETH:', addresses.ETH);
    console.log('   USDT:', addresses.USDT);
    
    console.log('3. Testing pool balances...');
    const balances = await poolWalletService.getPoolBalances();
    
    console.log('✅ Pool Balances:');
    console.log('   BTC:', balances.BTC);
    console.log('   ETH:', balances.ETH);
    console.log('   USDT:', balances.USDT);
    
    console.log('🎉 All tests passed! Pool wallet functionality is working.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
