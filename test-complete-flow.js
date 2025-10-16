require('dotenv').config({ path: './.env' });
const poolWalletService = require('./services/poolWalletService');
const withdrawalService = require('./services/withdrawalService');
const { query } = require('./config/database');

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Testnet Flow...\n');

  try {
    // 1. Initialize pool wallet
    console.log('1️⃣ Initializing pool wallet...');
    await poolWalletService.initializePoolWallets();
    const poolAddresses = await poolWalletService.getPoolAddresses();
    
    console.log('✅ Pool wallet addresses:');
    console.log(`   BTC (Testnet): ${poolAddresses.btc}`);
    console.log(`   ETH (Sepolia): ${poolAddresses.eth}`);
    console.log(`   USDT (Sepolia): ${poolAddresses.usdt}\n`);

    // 2. Check database tables
    console.log('2️⃣ Checking database tables...');
    const tables = ['users', 'wallets', 'withdrawal_requests', 'deposit_requests', 'transactions'];
    
    for (const table of tables) {
      try {
        const result = await query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`✅ Table ${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`❌ Table ${table}: ${error.message}`);
      }
    }

    // 3. Test user address generation
    console.log('\n3️⃣ Testing user address generation...');
    const testUserId = 'test-user-' + Date.now();
    
    const userBtcAddress = await poolWalletService.getUserDepositAddress(testUserId, 'BTC');
    const userEthAddress = await poolWalletService.getUserDepositAddress(testUserId, 'ETH');
    
    console.log('✅ User addresses generated:');
    console.log(`   BTC: ${userBtcAddress}`);
    console.log(`   ETH: ${userEthAddress}`);

    // 4. Test withdrawal service
    console.log('\n4️⃣ Testing withdrawal service...');
    const pendingWithdrawals = await withdrawalService.getPendingWithdrawals();
    console.log(`✅ Pending withdrawals: ${pendingWithdrawals.length}`);

    // 5. Check if admin user exists
    console.log('\n5️⃣ Checking admin user...');
    const adminResult = await query("SELECT id, email, role FROM users WHERE email = 'admin@uobsecurity.com'");
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      console.log(`✅ Admin user found: ${admin.email} (Role: ${admin.role})`);
    } else {
      console.log('❌ Admin user not found');
    }

    // 6. Display test instructions
    console.log('\n🎯 READY FOR TESTING!');
    console.log('\n📋 Next Steps:');
    console.log('1. Fund pool wallet addresses with testnet crypto:');
    console.log(`   BTC: ${poolAddresses.btc}`);
    console.log(`   ETH: ${poolAddresses.eth}`);
    console.log('2. Open http://localhost:3000 in your browser');
    console.log('3. Login as admin: admin@uobsecurity.com / admin123');
    console.log('4. Or register a new user and test the flow');
    console.log('5. Use MetaMask on Sepolia testnet for transactions');

    console.log('\n🔗 Testnet Resources:');
    console.log('• BTC Testnet Faucet: https://coinfaucet.eu/en/btc-testnet/');
    console.log('• ETH Sepolia Faucet: https://sepoliafaucet.com/');
    console.log('• Sepolia Explorer: https://sepolia.etherscan.io/');
    console.log('• Bitcoin Testnet Explorer: https://blockstream.info/testnet/');

    console.log('\n🧪 Test Scenarios:');
    console.log('1. User deposits crypto → Check balance updates');
    console.log('2. User requests withdrawal → Admin approves');
    console.log('3. User buys gold with crypto → Check gold holdings');
    console.log('4. Admin monitors pool wallet → Check deposits/withdrawals');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    const { pool } = require('./config/database');
    await pool.end();
  }
}

testCompleteFlow();
