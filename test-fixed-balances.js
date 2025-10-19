const poolWalletService = require('./services/poolWalletService');

async function testFixedBalances() {
  try {
    console.log('🧪 Testing Fixed Pool Balance Fetching...');
    
    // Initialize pool wallets
    await poolWalletService.initializePoolWallets();
    
    // Get addresses
    const addresses = poolWalletService.getPoolAddresses();
    console.log('\n📋 Pool Addresses:');
    console.log('ETH:', addresses.ETH);
    console.log('BTC:', addresses.BTC);
    console.log('USDT:', addresses.USDT);
    
    // Get balances
    console.log('\n💰 Fetching Pool Balances...');
    const balances = await poolWalletService.getPoolBalances();
    
    console.log('\n✅ Pool Balances:');
    console.log('ETH:', balances.ETH.balance, 'ETH');
    console.log('USDT:', balances.USDT.balance, 'USDT');
    console.log('BTC:', balances.BTC.balance, 'BTC');
    
    // Check if your 0.001 ETH deposit is showing
    if (balances.ETH.balance > 0) {
      console.log('\n🎉 SUCCESS: ETH balance detected!');
      console.log(`   Your 0.001 ETH deposit should be visible: ${balances.ETH.balance} ETH`);
    } else {
      console.log('\n⚠️  ETH balance is 0 - deposit might not be detected yet');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFixedBalances();
