const { query } = require('./config/database');
const poolWalletService = require('./services/poolWalletService');

async function testPoolPersistence() {
  try {
    console.log('🧪 Testing Pool Address Persistence...');
    
    // Test database connection
    console.log('1. Testing database connection...');
    const testQuery = await query('SELECT NOW() as current_time');
    console.log('✅ Database connected:', testQuery.rows[0].current_time);
    
    // Check existing pool addresses in database
    console.log('\n2. Checking existing pool addresses in database...');
    const existingAddresses = await query(`
      SELECT currency, address, verified, verified_at 
      FROM pool_addresses 
      ORDER BY currency
    `);
    
    console.log('📋 Existing pool addresses in database:');
    if (existingAddresses.rows.length === 0) {
      console.log('   No pool addresses found in database');
    } else {
      existingAddresses.rows.forEach(row => {
        console.log(`   ${row.currency}: ${row.address || 'EMPTY'} (verified: ${row.verified})`);
      });
    }
    
    // Initialize pool wallets
    console.log('\n3. Initializing pool wallets...');
    await poolWalletService.initializePoolWallets();
    
    // Get pool addresses from service
    console.log('\n4. Getting pool addresses from service...');
    const addresses = poolWalletService.getPoolAddresses();
    console.log('📋 Pool addresses from service:');
    console.log(`   ETH: ${addresses.ETH}`);
    console.log(`   BTC: ${addresses.BTC}`);
    console.log(`   USDT: ${addresses.USDT}`);
    
    // Check database again
    console.log('\n5. Checking database after initialization...');
    const updatedAddresses = await query(`
      SELECT currency, address, verified, verified_at 
      FROM pool_addresses 
      ORDER BY currency
    `);
    
    console.log('📋 Updated pool addresses in database:');
    updatedAddresses.rows.forEach(row => {
      console.log(`   ${row.currency}: ${row.address} (verified: ${row.verified})`);
    });
    
    console.log('\n🎉 Pool address persistence test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPoolPersistence();
