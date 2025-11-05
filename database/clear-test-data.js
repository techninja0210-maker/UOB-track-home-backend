require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function clearTestData() {
  console.log('🧹 Clearing Test Data from Database...');
  console.log('📊 This will remove transaction data, test users, and test records');
  console.log('✅ Seed data (admin user, crypto currencies, gold products) will be preserved\n');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'clear-test-data.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found: ${sqlPath}`);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Executing cleanup script...');
    
    // Execute the SQL in a transaction for safety
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Execute the entire SQL as one batch
      await client.query(sql);
      
      await client.query('COMMIT');
      console.log('✅ Test data cleared successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Verify what's left
    console.log('\n📋 Verifying remaining data...');
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM crypto_currencies) as crypto_count,
        (SELECT COUNT(*) FROM gold_securities) as gold_count,
        (SELECT COUNT(*) FROM wallets) as wallets_count,
        (SELECT COUNT(*) FROM transactions_ledger) as transactions_count,
        (SELECT COUNT(*) FROM transactions) as legacy_transactions_count
    `);
    
    console.log('\n📊 Remaining Data:');
    console.log(`   - Users: ${stats.rows[0].users_count} (should be 1 - admin user)`);
    console.log(`   - Crypto Currencies: ${stats.rows[0].crypto_count} (should be 3 - BTC, ETH, USDT)`);
    console.log(`   - Gold Products: ${stats.rows[0].gold_count} (should be 3 - Gold Bar products)`);
    console.log(`   - Wallets: ${stats.rows[0].wallets_count} (should be 1 - admin wallet)`);
    console.log(`   - Transactions Ledger: ${stats.rows[0].transactions_count} (should be 0)`);
    console.log(`   - Legacy Transactions: ${stats.rows[0].legacy_transactions_count} (should be 0)`);

    console.log('\n✅ Test data cleared! Seed data preserved.');
    console.log('\n👤 Admin credentials preserved:');
    console.log(`   Email: admin@uobsecurity.com`);
    
  } catch (err) {
    console.error('\n❌ Error clearing test data:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.position) console.error('Position:', err.position);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  clearTestData()
    .then(() => {
      console.log('\n✨ Cleanup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { clearTestData };

