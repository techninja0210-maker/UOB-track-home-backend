require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function initAITradingOnly() {
  console.log('🤖 Initializing AI Trading schema only...');
  try {
    // Read and execute AI trading schema
    const aiSchemaPath = path.join(__dirname, 'ai-trading-schema.sql');
    if (fs.existsSync(aiSchemaPath)) {
      console.log('📈 Applying AI trading schema...');
      const aiSql = fs.readFileSync(aiSchemaPath, 'utf8');
      await pool.query(aiSql);
      console.log('✅ AI trading schema applied successfully');
    } else {
      console.error('❌ AI trading schema file not found:', aiSchemaPath);
      process.exit(1);
    }

    // Test the tables were created
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%trading%' OR table_name LIKE '%bot%' OR table_name LIKE '%signal%'
      ORDER BY table_name
    `);
    
    console.log('📊 AI Trading tables created:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

  } catch (err) {
    console.error('❌ AI trading init error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  initAITradingOnly().then(() => process.exit(0));
}

module.exports = { initAITradingOnly };
