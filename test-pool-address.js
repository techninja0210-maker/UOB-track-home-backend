const axios = require('axios');

async function testPoolAddress() {
  try {
    console.log('🧪 Testing pool address endpoint...');
    
    // First, let's login to get a token
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    // Test pool address endpoints
    const currencies = ['ETH', 'BTC', 'USDT'];
    
    for (const currency of currencies) {
      try {
        const response = await axios.get(`http://localhost:5000/api/wallet/pool-address/${currency}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log(`✅ ${currency} Pool Address:`, response.data.address);
      } catch (error) {
        console.error(`❌ ${currency} Pool Address Error:`, error.response?.data || error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Wait a bit for server to start, then test
setTimeout(testPoolAddress, 3000);
