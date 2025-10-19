const { query } = require('./config/database');
const poolWalletService = require('./services/poolWalletService');

async function manualCreditDeposit() {
  try {
    console.log('🔧 Manual Deposit Credit Tool');
    console.log('This will credit a deposit that was sent to a different address');
    
    // Get the current pool addresses
    await poolWalletService.initializePoolWallets();
    const poolAddresses = poolWalletService.getPoolAddresses();
    
    console.log('\n📋 Current Pool Addresses:');
    console.log('ETH:', poolAddresses.ETH);
    console.log('BTC:', poolAddresses.BTC);
    console.log('USDT:', poolAddresses.USDT);
    
    console.log('\n⚠️  You sent 0.001 ETH to: 0xB23D6c589961170fcD4Ae3A7d2291603dC469552');
    console.log('   But platform is monitoring: 0x2E86738E0B6009bDd3dB58D7c3D5c130c812B6c0');
    
    // For testing purposes, let's credit the deposit manually
    const userId = 1; // Assuming user ID 1 for testing
    const currency = 'ETH';
    const amount = 0.001;
    
    console.log(`\n💳 Crediting ${amount} ${currency} to user ${userId}...`);
    
    // Check if user_balances table exists and has the right structure
    const checkTable = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_balances' 
      AND table_schema = 'public'
    `);
    
    console.log('📊 User balances table structure:', checkTable.rows);
    
    // Insert or update user balance
    await query(`
      INSERT INTO user_balances (user_id, currency, balance, available_balance, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, currency)
      DO UPDATE SET 
        balance = user_balances.balance + $3,
        available_balance = user_balances.available_balance + $3,
        updated_at = NOW()
    `, [userId, currency, amount, amount]);
    
    console.log('✅ Deposit credited successfully!');
    console.log('   User can now see their platform balance updated');
    
    // Also create a deposit request record for tracking
    await query(`
      INSERT INTO deposit_requests (user_id, currency, amount, pool_address, status, created_at)
      VALUES ($1, $2, $3, $4, 'credited', NOW())
    `, [userId, currency, amount, '0xB23D6c589961170fcD4Ae3A7d2291603dC469552']);
    
    console.log('📝 Deposit request record created');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

manualCreditDeposit();
