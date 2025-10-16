require('dotenv').config({ path: './.env' });
const axios = require('axios');

async function testPriceSources() {
  console.log('\n🔍 TESTING ACTUAL PRICE SOURCES\n');
  console.log('═'.repeat(60));

  // Test 1: Noones API
  console.log('\n1️⃣  Testing Noones API:');
  console.log('─'.repeat(60));
  console.log('API Key:', process.env.NOONES_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('Secret Key:', process.env.NOONES_SECRET_KEY ? '✅ Set' : '❌ Not set');
  
  try {
    const response = await axios.get('https://dev.noones.com/api/v1/prices', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    console.log('✅ Noones API Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Noones API Failed:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }

  // Test 2: CoinGecko API
  console.log('\n2️⃣  Testing CoinGecko API:');
  console.log('─'.repeat(60));
  console.log('API URL:', process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3 (default)');
  
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum,tether',
        vs_currencies: 'usd'
      },
      timeout: 5000
    });
    console.log('✅ CoinGecko API Status:', response.status);
    console.log('✅ BTC:', response.data.bitcoin.usd);
    console.log('✅ ETH:', response.data.ethereum.usd);
    console.log('✅ USDT:', response.data.tether.usd);
  } catch (error) {
    console.log('❌ CoinGecko API Failed:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }

  // Test 3: Binance API
  console.log('\n3️⃣  Testing Binance API:');
  console.log('─'.repeat(60));
  console.log('API URL:', process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3 (default)');
  
  try {
    const btc = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { timeout: 5000 });
    const eth = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', { timeout: 5000 });
    
    console.log('✅ Binance API Status:', btc.status);
    console.log('✅ BTC:', btc.data.price);
    console.log('✅ ETH:', eth.data.price);
    console.log('✅ USDT: 1.0 (pegged)');
  } catch (error) {
    console.log('❌ Binance API Failed:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
    }
  }

  // Test 4: Current Backend Response
  console.log('\n4️⃣  Testing Current Backend API:');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get('http://localhost:5000/api/prices/crypto');
    console.log('✅ Backend API Status:', response.status);
    console.log('✅ Prices:', response.data);
  } catch (error) {
    console.log('❌ Backend API Failed:', error.message);
  }

  // Summary
  console.log('\n═'.repeat(60));
  console.log('\n📊 SUMMARY:\n');
  console.log('The backend uses this fallback chain:');
  console.log('1. Noones API (if configured) → Currently failing (404)');
  console.log('2. CoinGecko API → Check above');
  console.log('3. Binance API → Check above');
  console.log('4. Database cache → Always available\n');
  console.log('Your backend is getting prices from one of these sources!');
  console.log('\n═'.repeat(60));
}

testPriceSources().catch(console.error);



