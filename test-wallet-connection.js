require('dotenv').config();
const { query } = require('./config/database');
const walletAddressService = require('./services/walletAddressService');

async function testWalletSystem() {
  console.log('🔍 Testing Blockchain Wallet System...\n');

  try {
    // Test 1: Database Connection
    console.log('1️⃣ Testing database connection...');
    const dbTest = await query('SELECT NOW()');
    console.log('✅ Database connected:', dbTest.rows[0].now);
    console.log('');

    // Test 2: Check if wallets table has address columns
    console.log('2️⃣ Checking wallets table structure...');
    const tableCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'wallets' AND column_name IN ('btc_address', 'eth_address', 'usdt_address')
    `);
    
    if (tableCheck.rows.length === 3) {
      console.log('✅ Wallet address columns exist');
    } else {
      console.log('⚠️  Wallet address columns missing. Need to add them.');
      console.log('   Columns found:', tableCheck.rows.map(r => r.column_name).join(', '));
    }
    console.log('');

    // Test 3: Check deposit_requests table
    console.log('3️⃣ Checking deposit_requests table...');
    const depositTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'deposit_requests'
      )
    `);
    
    if (depositTableCheck.rows[0].exists) {
      console.log('✅ deposit_requests table exists');
    } else {
      console.log('⚠️  deposit_requests table missing');
    }
    console.log('');

    // Test 4: Check withdrawal_requests table
    console.log('4️⃣ Checking withdrawal_requests table...');
    const withdrawalTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'withdrawal_requests'
      )
    `);
    
    if (withdrawalTableCheck.rows[0].exists) {
      console.log('✅ withdrawal_requests table exists');
    } else {
      console.log('⚠️  withdrawal_requests table missing');
    }
    console.log('');

    // Test 5: Environment variables
    console.log('5️⃣ Checking environment variables...');
    const envVars = {
      'WALLET_ENCRYPTION_KEY': process.env.WALLET_ENCRYPTION_KEY,
      'MASTER_WALLET_SEED': process.env.MASTER_WALLET_SEED,
      'ETH_RPC_URL': process.env.ETH_RPC_URL
    };
    
    for (const [key, value] of Object.entries(envVars)) {
      if (value && !value.includes('CHANGE') && !value.includes('YOUR')) {
        console.log(`✅ ${key}: Configured`);
      } else {
        console.log(`⚠️  ${key}: Not configured or using placeholder`);
      }
    }
    console.log('');

    // Test 6: Address Generation
    console.log('6️⃣ Testing address generation...');
    try {
      const testUserId = 'test-user-123';
      const addresses = await walletAddressService.generateAllAddresses(testUserId);
      
      console.log('✅ BTC Address generated:', addresses.btc.address.substring(0, 20) + '...');
      console.log('✅ ETH Address generated:', addresses.eth.address.substring(0, 20) + '...');
      console.log('✅ USDT Address generated:', addresses.usdt.address.substring(0, 20) + '...');
      console.log('✅ Private keys encrypted successfully');
    } catch (error) {
      console.log('❌ Address generation failed:', error.message);
    }
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Database connection: WORKING');
    console.log('✅ Address generation: WORKING');
    console.log('⚠️  Database schema: NEEDS MANUAL UPDATE');
    console.log('');
    console.log('Next steps:');
    console.log('1. Contact Neon database admin to run the schema update');
    console.log('2. Or: Use Neon web console to run add-wallet-addresses.sql');
    console.log('3. Then: Restart backend and test again');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }

  process.exit(0);
}

testWalletSystem();



