const { Pool } = require('pg');
require('dotenv').config();

console.log('🧪 Testing Simple Database Operations...');
console.log('📋 Connection String:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Test basic connection and permissions
async function testDatabase() {
  try {
    // Test 1: Basic connection
    console.log('\n1️⃣ Testing basic connection...');
    const result1 = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Connection successful!');
    console.log('📊 Database time:', result1.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result1.rows[0].pg_version.split(' ')[0]);

    // Test 2: Check current user and permissions
    console.log('\n2️⃣ Checking user permissions...');
    const result2 = await pool.query('SELECT current_user, current_database()');
    console.log('👤 Current user:', result2.rows[0].current_user);
    console.log('🗄️ Current database:', result2.rows[0].current_database);

    // Test 3: Check existing tables
    console.log('\n3️⃣ Checking existing tables...');
    const result3 = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (result3.rows.length > 0) {
      console.log('📋 Existing tables:');
      result3.rows.forEach(row => console.log(`   - ${row.table_name}`));
    } else {
      console.log('📋 No tables found in public schema');
    }

    // Test 4: Try to create a simple test table
    console.log('\n4️⃣ Testing table creation permissions...');
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, name VARCHAR(50))');
      console.log('✅ Can create tables!');
      
      // Test inserting data
      await pool.query("INSERT INTO test_table (name) VALUES ('test')");
      console.log('✅ Can insert data!');
      
      // Test reading data
      const result4 = await pool.query('SELECT * FROM test_table');
      console.log('✅ Can read data! Rows:', result4.rows.length);
      
      // Clean up
      await pool.query('DROP TABLE test_table');
      console.log('✅ Can drop tables!');
      
    } catch (createError) {
      console.log('❌ Cannot create tables:', createError.message);
      console.log('💡 This might be a permission issue with the database user');
    }

    console.log('\n🎉 Database test completed successfully!');
    
  } catch (error) {
    console.log('❌ Database test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testDatabase();




