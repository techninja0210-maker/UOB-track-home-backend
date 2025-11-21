require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function initProductionSafe() {
  console.log('🚀 Initializing Production Database (Safe Mode)...');
  console.log('📊 This will create all tables, indexes, triggers, and seed data');
  console.log('✅ Using CREATE TABLE IF NOT EXISTS (safe for existing databases)\n');
  
  try {
    // Read the safe production initialization SQL file
    const sqlPath = path.join(__dirname, 'production-init-safe.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found: ${sqlPath}`);
    }
    
    let sql = fs.readFileSync(sqlPath, 'utf8');

    // Generate admin password hash
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(password, 10);
    sql = sql.replace('$2b$10$YourHashWillBeGeneratedHere', hash);

    console.log('📝 Executing database schema...');
    
    const client = await pool.connect();
    try {
      // Check if pgcrypto extension exists
      let extensionExists = false;
      try {
        const extCheck = await client.query(`
          SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') as exists
        `);
        extensionExists = extCheck.rows[0].exists;
        if (extensionExists) {
          console.log('✅ pgcrypto extension already exists');
        }
      } catch (checkError) {
        console.log('⚠️  Could not check for pgcrypto extension');
      }
      
      // Try to create extension if it doesn't exist
      if (!extensionExists) {
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
          console.log('✅ pgcrypto extension created');
        } catch (extError) {
          if (extError.code === '42501' || extError.message.includes('permission denied')) {
            console.log('⚠️  Cannot create pgcrypto extension (permission denied)');
            console.log('💡 The extension may need to be enabled manually in your database dashboard');
            console.log('💡 Or it may already exist. Continuing with table creation...');
          } else {
            console.log('⚠️  Extension creation failed, but continuing:', extError.message);
          }
        }
      }
      
      // Remove the CREATE EXTENSION line from SQL since we handled it above
      const sqlWithoutExtension = sql.replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*;/gi, '');
      
      // Start transaction
      await client.query('BEGIN');
      
      // Execute the SQL (execute all at once - PostgreSQL handles IF NOT EXISTS well)
      try {
        await client.query(sqlWithoutExtension);
        await client.query('COMMIT');
        console.log('✅ Database schema executed successfully');
      } catch (execError) {
        await client.query('ROLLBACK');
        
        // Check if it's a permission error
        if (execError.code === '42501' || execError.message.includes('permission denied')) {
          console.error('\n❌ Permission denied error:');
          console.error(`   ${execError.message}`);
          console.error('\n💡 Your database user needs CREATE privileges on the public schema.');
          console.error('\n📋 For Neon/Cloud databases, try one of these solutions:');
          console.error('\n1. In your Neon dashboard, go to SQL Editor and run:');
          console.error('   GRANT CREATE ON SCHEMA public TO public;');
          console.error('   GRANT ALL ON SCHEMA public TO public;');
          console.error('\n2. Or connect as database owner and run the init script');
          console.error('\n3. Or manually enable pgcrypto extension:');
          console.error('   CREATE EXTENSION IF NOT EXISTS pgcrypto;');
          throw new Error('Database permission denied. Please grant CREATE privileges on the public schema.');
        }
        throw execError;
      }
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }

    // Verify tables were created
    console.log('\n📋 Verifying database initialization...');
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`✅ Found ${tablesCheck.rows.length} tables:`);
    tablesCheck.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Get seed data statistics
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM crypto_currencies) as crypto_count,
        (SELECT COUNT(*) FROM gold_securities) as gold_count,
        (SELECT COUNT(*) FROM wallets) as wallets_count
    `);
    
    console.log('\n📊 Database Statistics:');
    console.log(`   - Users: ${stats.rows[0].users_count}`);
    console.log(`   - Crypto Currencies: ${stats.rows[0].crypto_count}`);
    console.log(`   - Gold Products: ${stats.rows[0].gold_count}`);
    console.log(`   - Wallets: ${stats.rows[0].wallets_count}`);

    console.log('\n✅ Production database initialized successfully!');
    console.log(`\n👤 Admin credentials:`);
    console.log(`   Email: admin@uobsecurity.com`);
    console.log(`   Password: ${password}`);
    console.log(`\n⚠️  IMPORTANT: Change the admin password after first login!`);
    console.log(`\n🚀 Your platform is ready to use!`);
    
  } catch (err) {
    console.error('\n❌ Database initialization error:');
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
  initProductionSafe()
    .then(() => {
      console.log('\n✨ Initialization complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initProductionSafe };

