const { ethers } = require('ethers');
require('dotenv').config();

async function testBalanceFetching() {
  try {
    console.log('🧪 Testing Pool Balance Fetching...');
    
    // Check environment variables
    console.log('\n1. Environment Variables:');
    console.log('ETH_RPC_URL:', process.env.ETH_RPC_URL ? 'SET' : 'NOT SET');
    console.log('ETH_RPC_URL value:', process.env.ETH_RPC_URL);
    
    // Pool addresses
    const poolAddresses = {
      ETH: '0xB23D6c589961170fcD4Ae3A7d2291603dC469552',
      BTC: '1GR7NoyjbyN4Y6tLkjLDoVzwCk81oWGcqH',
      USDT: '0xB23D6c589961170fcD4Ae3A7d2291603dC469552'
    };
    
    console.log('\n2. Pool Addresses:');
    console.log('ETH:', poolAddresses.ETH);
    console.log('BTC:', poolAddresses.BTC);
    console.log('USDT:', poolAddresses.USDT);
    
    // Test ETH balance
    console.log('\n3. Testing ETH Balance...');
    if (process.env.ETH_RPC_URL) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
        const ethBalance = await provider.getBalance(poolAddresses.ETH);
        const ethBalanceFormatted = parseFloat(ethers.formatEther(ethBalance));
        console.log('✅ ETH Balance:', ethBalanceFormatted, 'ETH');
      } catch (error) {
        console.error('❌ ETH Balance Error:', error.message);
      }
    } else {
      console.log('❌ ETH_RPC_URL not set');
    }
    
    // Test USDT balance (Sepolia testnet)
    console.log('\n4. Testing USDT Balance...');
    if (process.env.ETH_RPC_URL) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
        // Sepolia USDT contract address (testnet)
        const sepoliaUsdtContract = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
        const usdtAbi = ["function balanceOf(address owner) view returns (uint256)"];
        const usdtContract = new ethers.Contract(sepoliaUsdtContract, usdtAbi, provider);
        const usdtBalance = await usdtContract.balanceOf(poolAddresses.USDT);
        const usdtBalanceFormatted = parseFloat(ethers.formatUnits(usdtBalance, 6));
        console.log('✅ USDT Balance:', usdtBalanceFormatted, 'USDT');
      } catch (error) {
        console.error('❌ USDT Balance Error:', error.message);
      }
    } else {
      console.log('❌ ETH_RPC_URL not set');
    }
    
    // Test with Sepolia RPC
    console.log('\n5. Testing with Sepolia RPC...');
    try {
      const sepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161');
      const ethBalance = await sepoliaProvider.getBalance(poolAddresses.ETH);
      const ethBalanceFormatted = parseFloat(ethers.formatEther(ethBalance));
      console.log('✅ ETH Balance (Sepolia):', ethBalanceFormatted, 'ETH');
    } catch (error) {
      console.error('❌ Sepolia ETH Balance Error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBalanceFetching();
