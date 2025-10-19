const axios = require('axios');

async function testPoolEndpoints() {
  try {
    console.log('🧪 Testing Pool Wallet Endpoints...');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 1: Login to get token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test 2: Test pool address endpoint
    console.log('\n2. Testing pool address endpoint...');
    const poolAddressResponse = await axios.get('http://localhost:5000/api/wallet/pool-address/ETH', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Pool Address Response:', poolAddressResponse.data);
    
    // Test 3: Test admin pool wallets endpoint
    console.log('\n3. Testing admin pool wallets endpoint...');
    const adminPoolResponse = await axios.get('http://localhost:5000/api/admin/pool-wallets', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Admin Pool Wallets Response:', JSON.stringify(adminPoolResponse.data, null, 2));
    
    // Test 4: Test all currencies
    console.log('\n4. Testing all currencies...');
    const currencies = ['ETH', 'BTC', 'USDT'];
    
    for (const currency of currencies) {
      try {
        const response = await axios.get(`http://localhost:5000/api/wallet/pool-address/${currency}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✅ ${currency} Pool Address:`, response.data.address);
      } catch (error) {
        console.error(`❌ ${currency} Error:`, error.response?.data || error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Server might not be running. Try: cd backend && npm start');
    }
  }
}

testPoolEndpoints();
