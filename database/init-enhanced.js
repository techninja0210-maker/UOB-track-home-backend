require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function initializeEnhancedDatabase() {
  console.log('🔄 Initializing Enhanced Database Schema...');
  console.log('📊 Adding: Wallets, Gold Securities, Transactions, SKRs');
  
  try {
    // Read enhanced schema file
    const schemaPath = path.join(__dirname, 'enhanced-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    await pool.query(schema);
    
    console.log('✅ Enhanced database schema created successfully');
    console.log('✅ Crypto currencies added (BTC, USDT, ETH)');
    console.log('✅ Gold securities added (1oz, 10g, 100g, 1kg bars)');
    console.log('✅ Wallet tables created');
    console.log('✅ Transaction tracking ready');
    console.log('✅ SKR system initialized');
    console.log('✅ Admin merchant wallet created');
    console.log('✅ Platform settings configured');
    
    // Get statistics
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM crypto_currencies) as crypto_count,
        (SELECT COUNT(*) FROM gold_securities) as gold_count,
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM receipts) as receipt_count
    `);
    
    console.log('📊 Database Statistics:');
    console.log('   - Crypto Currencies:', stats.rows[0].crypto_count);
    console.log('   - Gold Products:', stats.rows[0].gold_count);
    console.log('   - Users:', stats.rows[0].user_count);
    console.log('   - Receipts:', stats.rows[0].receipt_count);
    
    console.log('\n✅ Enhanced database ready for crypto & gold trading!');
    
  } catch (error) {
    console.error('❌ Enhanced database initialization error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initializeEnhancedDatabase()
    .then(() => {
      console.log('\n✅ Enhanced database initialization complete!');
      console.log('🚀 Your platform is ready for crypto-to-gold trading!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Enhanced database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeEnhancedDatabase };


