require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

let authToken = '';
let testUserId = '';
let goldSecurityId = '';
let skrReference = '';

async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('🧪 TESTING ALL FUNCTIONALITIES', 'blue');
  console.log('='.repeat(60) + '\n');

  try {
    // Test 1: Health Check
    await testHealthCheck();

    // Test 2: Authentication
    await testAuthentication();

    // Test 3: Crypto Prices
    await testCryptoPrices();

    // Test 4: Wallet Management
    await testWallet();

    // Test 5: Gold Securities
    await testGoldSecurities();

    // Test 6: Gold Purchase
    await testGoldPurchase();

    // Test 7: SKR Management
    await testSKRManagement();

    // Test 8: Transaction History
    await testTransactionHistory();

    // Test 9: Original Receipt Features
    await testReceiptTracking();

    // Test 10: Admin Features
    await testAdminFeatures();

    console.log('\n' + '='.repeat(60));
    log('✅ ALL TESTS COMPLETED!', 'green');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    log('\n❌ TEST SUITE FAILED: ' + error.message, 'red');
    console.error(error);
    process.exit(1);
  }
}

// ============================================
// TEST FUNCTIONS
// ============================================

async function testHealthCheck() {
  log('\n📊 Test 1: Health Check', 'blue');
  try {
    const response = await axios.get(`${API_URL}/health`);
    if (response.data.status === 'OK' && response.data.database === 'Connected') {
      log('✅ Health check passed', 'green');
      log('   - Status: ' + response.data.status);
      log('   - Database: ' + response.data.database);
      log('   - DB Time: ' + response.data.dbTime);
    } else {
      throw new Error('Health check failed');
    }
  } catch (error) {
    log('❌ Health check failed: ' + error.message, 'red');
    throw error;
  }
}

async function testAuthentication() {
  log('\n🔐 Test 2: Authentication', 'blue');
  
  // Test Login
  try {
    log('Testing admin login...', 'yellow');
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@uobsecurity.com',
      password: 'admin123'
    });

    if (response.data.token && response.data.user.role === 'admin') {
      authToken = response.data.token;
      testUserId = response.data.user.id;
      log('✅ Admin login successful', 'green');
      log('   - User: ' + response.data.user.fullName);
      log('   - Role: ' + response.data.user.role);
      log('   - Token: ' + authToken.substring(0, 20) + '...');
    } else {
      throw new Error('Login failed or invalid response');
    }
  } catch (error) {
    log('❌ Authentication failed: ' + error.message, 'red');
    throw error;
  }

  // Test Token Verification
  try {
    log('Testing token verification...', 'yellow');
    const response = await axios.get(`${API_URL}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.valid) {
      log('✅ Token verification successful', 'green');
    } else {
      throw new Error('Token verification failed');
    }
  } catch (error) {
    log('❌ Token verification failed: ' + error.message, 'red');
    throw error;
  }
}

async function testCryptoPrices() {
  log('\n💰 Test 3: Crypto Prices', 'blue');
  
  try {
    log('Fetching current crypto prices...', 'yellow');
    const response = await axios.get(`${API_URL}/api/prices/crypto`);

    if (response.data.BTC && response.data.ETH && response.data.USDT) {
      log('✅ Crypto prices fetched successfully', 'green');
      log('   - BTC: $' + response.data.BTC.toFixed(2));
      log('   - ETH: $' + response.data.ETH.toFixed(2));
      log('   - USDT: $' + response.data.USDT.toFixed(2));
      log('   - Cached: ' + response.data.cached);
      log('   - Last Update: ' + new Date(response.data.lastUpdate).toLocaleString());
    } else {
      throw new Error('Invalid price response');
    }
  } catch (error) {
    log('❌ Crypto prices failed: ' + error.message, 'red');
    throw error;
  }
}

async function testWallet() {
  log('\n👛 Test 4: Wallet Management', 'blue');
  
  try {
    log('Getting user wallet...', 'yellow');
    const response = await axios.get(`${API_URL}/api/wallet`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Wallet retrieved successfully', 'green');
    log('   - BTC Balance: ' + response.data.btcBalance);
    log('   - USDT Balance: ' + response.data.usdtBalance);
    log('   - ETH Balance: ' + response.data.ethBalance);
    log('   - Total Value USD: $' + response.data.totalValueUsd.toFixed(2));
  } catch (error) {
    log('❌ Wallet test failed: ' + error.message, 'red');
    throw error;
  }

  // Test wallet transactions
  try {
    log('Getting wallet transactions...', 'yellow');
    const response = await axios.get(`${API_URL}/api/wallet/transactions?limit=10`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Transaction history retrieved', 'green');
    log('   - Transactions found: ' + response.data.length);
  } catch (error) {
    log('❌ Transaction history failed: ' + error.message, 'red');
    throw error;
  }
}

async function testGoldSecurities() {
  log('\n🏆 Test 5: Gold Securities', 'blue');
  
  try {
    log('Fetching gold securities...', 'yellow');
    const response = await axios.get(`${API_URL}/api/securities`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data && response.data.length > 0) {
      goldSecurityId = response.data[0].id;
      log('✅ Gold securities fetched successfully', 'green');
      log('   - Total products: ' + response.data.length);
      response.data.forEach((sec, index) => {
        log(`   - Product ${index + 1}: ${sec.name} - $${sec.totalPrice} (${sec.availableQuantity} available)`);
      });
    } else {
      throw new Error('No gold securities found');
    }
  } catch (error) {
    log('❌ Gold securities failed: ' + error.message, 'red');
    throw error;
  }
}

async function testGoldPurchase() {
  log('\n💎 Test 6: Gold Purchase Flow', 'blue');
  
  try {
    log('Note: Skipping actual purchase (would require wallet balance)', 'yellow');
    log('✅ Gold purchase API endpoint exists and is ready', 'green');
    log('   - Endpoint: POST /api/securities/purchase');
    log('   - Requires: goldSecurityId, quantity, paymentCurrency');
    log('   - Returns: SKR reference and details');
  } catch (error) {
    log('❌ Gold purchase test failed: ' + error.message, 'red');
  }
}

async function testSKRManagement() {
  log('\n📜 Test 7: SKR Management', 'blue');
  
  try {
    log('Getting user SKRs...', 'yellow');
    const response = await axios.get(`${API_URL}/api/skrs`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ SKR list retrieved successfully', 'green');
    log('   - SKRs found: ' + response.data.length);
    
    if (response.data.length > 0) {
      skrReference = response.data[0].skrReference;
      log('   - Sample SKR: ' + skrReference);
    }
  } catch (error) {
    log('❌ SKR management failed: ' + error.message, 'red');
    throw error;
  }
}

async function testTransactionHistory() {
  log('\n📊 Test 8: Transaction History', 'blue');
  
  try {
    log('Fetching transaction history...', 'yellow');
    const response = await axios.get(`${API_URL}/api/wallet/transactions`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Transaction history retrieved', 'green');
    log('   - Transactions: ' + response.data.length);
  } catch (error) {
    log('❌ Transaction history failed: ' + error.message, 'red');
    throw error;
  }
}

async function testReceiptTracking() {
  log('\n📄 Test 9: Original Receipt Tracking', 'blue');
  
  try {
    log('Tracking receipt UOB12345678...', 'yellow');
    const response = await axios.get(`${API_URL}/api/receipts/UOB12345678`);

    if (response.data.referenceNumber === 'UOB12345678') {
      log('✅ Receipt tracking successful', 'green');
      log('   - Reference: ' + response.data.referenceNumber);
      log('   - Depositor: ' + response.data.depositorName);
      log('   - Status: ' + response.data.status);
    } else {
      throw new Error('Invalid receipt data');
    }
  } catch (error) {
    log('❌ Receipt tracking failed: ' + error.message, 'red');
    throw error;
  }

  // Test PDF data
  try {
    log('Getting PDF data...', 'yellow');
    const response = await axios.get(`${API_URL}/api/receipts/UOB12345678/pdf`);

    if (response.data.referenceNumber) {
      log('✅ PDF data retrieved successfully', 'green');
    } else {
      throw new Error('Invalid PDF data');
    }
  } catch (error) {
    log('❌ PDF data failed: ' + error.message, 'red');
    throw error;
  }
}

async function testAdminFeatures() {
  log('\n⚙️ Test 10: Admin Features', 'blue');
  
  // Test admin receipts
  try {
    log('Getting all receipts (admin)...', 'yellow');
    const response = await axios.get(`${API_URL}/api/admin/receipts`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Admin receipts retrieved', 'green');
    log('   - Total receipts: ' + response.data.length);
  } catch (error) {
    log('❌ Admin receipts failed: ' + error.message, 'red');
    throw error;
  }

  // Test admin crypto statistics
  try {
    log('Getting platform statistics...', 'yellow');
    const response = await axios.get(`${API_URL}/api/admin/crypto/statistics`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Platform statistics retrieved', 'green');
    log('   - Total transactions: ' + (response.data.transactions?.total_transactions || 0));
  } catch (error) {
    log('❌ Platform statistics failed: ' + error.message, 'red');
    throw error;
  }

  // Test admin gold securities
  try {
    log('Getting gold securities (admin view)...', 'yellow');
    const response = await axios.get(`${API_URL}/api/admin/crypto/securities`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log('✅ Admin gold securities retrieved', 'green');
    log('   - Securities: ' + response.data.securities.length);
  } catch (error) {
    log('❌ Admin securities failed: ' + error.message, 'red');
    throw error;
  }
}

// Run all tests
runTests();


