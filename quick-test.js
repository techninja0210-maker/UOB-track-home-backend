console.log('🧪 Quick Pool Wallet Test...');

const poolWalletService = require('./services/poolWalletService');

async function test() {
  try {
    console.log('1. Initializing pool wallets...');
    await poolWalletService.initializePoolWallets();
    
    console.log('2. Getting addresses...');
    const addresses = poolWalletService.getPoolAddresses();
    console.log('Addresses:', addresses);
    
    console.log('3. Getting balances...');
    const balances = await poolWalletService.getPoolBalances();
    console.log('Balances:', balances);
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
