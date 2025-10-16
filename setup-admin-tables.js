require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupAdminTables() {
  console.log('🚀 Setting up Admin Tables...');
  try {
    const schemaPath = path.join(__dirname, 'database', 'create-admin-tables.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Reading SQL schema...');
    console.log('💾 Executing database schema updates...');
    await query(schemaSql);
    console.log('✅ Admin tables created successfully!');

    console.log('🎉 Admin Tables Setup Complete!');
  } catch (error) {
    console.error('❌ Setup error:', error);
    process.exit(1);
  } finally {
    // Ensure the database pool is ended
    const { pool } = require('./config/database');
    await pool.end();
  }
}

setupAdminTables();

