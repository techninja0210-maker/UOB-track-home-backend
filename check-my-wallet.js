require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');
const walletAddressService = require('./services/walletAddressService');

async function checkWallet() {
  console.log('\n🔍 Checking Wallet Information...\n');

  try {
    // Get all users and their wallets
    const result = await query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        w.btc_address,
        w.eth_address,
        w.usdt_address,
        w.btc_balance,
        w.eth_balance,
        w.usdt_balance
      FROM users u
      LEFT JOIN wallets w ON u.id = w.user_id
      ORDER BY u.created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('❌ No users found in database.');
      process.exit(0);
    }

    console.log(`📊 Found ${result.rows.length} user(s):\n`);

    for (const user of result.rows) {
      console.log('═'.repeat(70));
      console.log(`👤 User: ${user.full_name} (${user.email})`);
      console.log(`🆔 User ID: ${user.id}`);
      console.log('─'.repeat(70));
      
      if (user.btc_address) {
        console.log(`₿  BTC Address: ${user.btc_address}`);
        console.log(`   Balance: ${user.btc_balance || 0} BTC`);
      } else {
        console.log(`₿  BTC Address: NOT GENERATED YET`);
        console.log(`   (Will generate when user clicks "Generate BTC Address")`);
      }
      
      console.log('');
      
      if (user.eth_address) {
        console.log(`Ξ  ETH Address: ${user.eth_address}`);
        console.log(`   Balance: ${user.eth_balance || 0} ETH`);
      } else {
        console.log(`Ξ  ETH Address: NOT GENERATED YET`);
      }
      
      console.log('');
      
      if (user.usdt_address) {
        console.log(`₮  USDT Address: ${user.usdt_address}`);
        console.log(`   Balance: ${user.usdt_balance || 0} USDT`);
      } else {
        console.log(`₮  USDT Address: NOT GENERATED YET`);
      }
      
      console.log('═'.repeat(70));
      console.log('');
    }

    // Check if there are any pending transactions
    const deposits = await query(`
      SELECT COUNT(*) as count FROM deposit_requests WHERE status = 'pending'
    `);
    
    const withdrawals = await query(`
      SELECT COUNT(*) as count FROM withdrawal_requests WHERE status = 'pending'
    `);

    console.log('\n📊 Transaction Summary:');
    console.log(`   Pending Deposits: ${deposits.rows[0].count}`);
    console.log(`   Pending Withdrawals: ${withdrawals.rows[0].count}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    const { pool } = require('./config/database');
    await pool.end();
  }
}

checkWallet();



