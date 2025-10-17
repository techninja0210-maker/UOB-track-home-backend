const { Pool } = require('pg');
require('dotenv').config();

console.log('🧪 Testing Database Connection...');
console.log('📋 Connection String:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('❌ Database connection failed:');
    console.log('🔍 Error Code:', err.code);
    console.log('📝 Error Message:', err.message);
    console.log('🌐 Error Detail:', err.detail);
    
    if (err.code === 'ECONNREFUSED') {
      console.log('\n💡 Solution: PostgreSQL is not running or not installed');
      console.log('📥 Install PostgreSQL: https://www.postgresql.org/download/');
      console.log('☁️ Or use cloud database: https://neon.tech (free)');
    } else if (err.code === 'EACCES') {
      console.log('\n💡 Solution: Permission denied - check PostgreSQL service');
    } else if (err.code === 'ENOTFOUND') {
      console.log('\n💡 Solution: Database host not found - check connection string');
    }
    
    process.exit(1);
  } else {
    console.log('✅ Database connection successful!');
    console.log('📊 Database time:', res.rows[0].now);
    console.log('🎉 PostgreSQL is running and accessible');
    
    // Test if database exists
    pool.query("SELECT datname FROM pg_database WHERE datname = 'track_platform'", (err2, res2) => {
      if (err2) {
        console.log('⚠️ Error checking database:', err2.message);
      } else if (res2.rows.length > 0) {
        console.log('✅ Database "track_platform" exists');
      } else {
        console.log('⚠️ Database "track_platform" does not exist - needs to be created');
      }
      
      pool.end();
      process.exit(0);
    });
  }
});





