require('dotenv').config();
const { query } = require('./config/database');

async function checkTables() {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 Current Database Tables:');
    console.log('='.repeat(40));
    
    if (result.rows.length === 0) {
      console.log('⚠️  No tables found!');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.table_name}`);
      });
    }
    
    console.log('='.repeat(40));
    console.log(`Total: ${result.rows.length} tables`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

checkTables();



