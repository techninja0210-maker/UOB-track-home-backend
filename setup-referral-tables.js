const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupReferralTables() {
  try {
    console.log('🔄 Setting up referral database tables...');
    
    // Read the referral schema file
    const schemaPath = path.join(__dirname, 'database', 'referral-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    await pool.query(schema);
    
    console.log('✅ Referral database tables created successfully!');
    console.log('📊 Tables created:');
    console.log('   - user_referral_codes');
    console.log('   - referrals');
    console.log('   - referral_commissions');
    console.log('   - referral_bonuses');
    console.log('   - referral_earnings');
    
    // Test the tables by trying to get a referral code
    console.log('\n🧪 Testing referral system...');
    
    // Check if we can query the tables
    const testQuery = await pool.query('SELECT COUNT(*) FROM user_referral_codes');
    console.log('✅ Database connection and tables working!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up referral tables:', error);
    process.exit(1);
  }
}

setupReferralTables();
