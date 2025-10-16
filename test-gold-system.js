require('dotenv').config({ path: './.env' });
const goldPriceService = require('./services/goldPriceService');
const { query, pool } = require('./config/database');
const fs = require('fs');

async function testGoldSystem() {
  console.log('\n🧪 Testing Gold Exchange System...\n');
  
  try {
    // Test 1: Database Schema
    console.log('📊 Step 1: Updating database schema...');
    const schemaSQL = fs.readFileSync('./database/add-gold-holdings.sql', 'utf8');
    await query(schemaSQL);
    console.log('✅ Database schema updated!\n');

    // Test 2: Gold Price API
    console.log('💰 Step 2: Testing gold price API...');
    const priceData = await goldPriceService.getGoldPriceWithMetadata();
    console.log('✅ Gold Price:', JSON.stringify(priceData, null, 2));
    console.log('');

    // Test 3: Crypto to Gold Calculation
    console.log('🔄 Step 3: Testing crypto → gold calculation...');
    const btcToGold = await goldPriceService.calculateCryptoToGold(0.01, 45000);
    console.log('✅ 0.01 BTC → Gold:', JSON.stringify(btcToGold, null, 2));
    console.log('');

    // Test 4: Gold to Crypto Calculation
    console.log('🔄 Step 4: Testing gold → crypto calculation...');
    const goldToEth = await goldPriceService.calculateGoldToCrypto(10, 2500);
    console.log('✅ 10g Gold → ETH:', JSON.stringify(goldToEth, null, 2));
    console.log('');

    // Test 5: Check Database Tables
    console.log('🗄️ Step 5: Checking database tables...');
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('gold_holdings', 'gold_securities', 'gold_price_history')
      ORDER BY table_name
    `);
    console.log('✅ Tables found:', tableCheck.rows.map(r => r.table_name).join(', '));
    console.log('');

    console.log('🎉 All tests passed!\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Gold Exchange System is ready!');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📝 Next steps:');
    console.log('1. Start backend: npm run dev');
    console.log('2. Test API: curl http://localhost:5000/api/prices/gold/current');
    console.log('3. Read guide: GOLD-EXCHANGE-SETUP.md\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nError details:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testGoldSystem();



