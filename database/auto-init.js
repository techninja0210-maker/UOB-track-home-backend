require('dotenv').config();
const { pool } = require('../config/database');
const { initProductionSafe } = require('./init-production-safe');

/**
 * Auto-initialize database if tables don't exist
 * This is safe to call on every server startup
 * Returns true if initialization was performed, false if already initialized
 */
async function autoInitializeDatabase() {
  try {
    // Use the comprehensive check to see if all required tables exist
    const dbStatus = await checkDatabaseInitialization();
    
    // If any required tables are missing, run initialization
    if (!dbStatus.initialized && dbStatus.missingTables.length > 0) {
      console.log('🔍 Database appears uninitialized. Missing tables:', dbStatus.missingTables);
      console.log('🚀 Auto-initializing database...');
      console.log('📝 Running production database initialization...\n');
      
      // Close current pool connection, init script will create new one
      await pool.end();
      
      // Run initialization (using safe version - uses CREATE TABLE IF NOT EXISTS)
      await initProductionSafe();
      
      // Re-import pool after initialization
      const { pool: newPool } = require('../config/database');
      console.log('✅ Database auto-initialization complete!\n');
      return true;
    } else {
      console.log('✅ Database already fully initialized - all required tables exist');
      return false;
    }
  } catch (error) {
    console.error('❌ Auto-initialization check failed:', error.message);
    // Don't throw - allow server to continue even if auto-init check fails
    // Admin can manually run init script if needed
    return false;
  }
}

/**
 * Check if database is properly initialized
 * Returns { initialized: boolean, missingTables: string[] }
 */
async function checkDatabaseInitialization() {
  const requiredTables = [
    'users',
    'wallets',
    'transactions',
    'gold_holdings',
    'crypto_currencies',
    'gold_securities',
    'withdrawal_requests',
    'referrals',
    'crowdfunding_contracts',
    'trading_bots',
    'pool_addresses',
    'user_balances',
    'transactions_ledger',
    'deposit_requests'
  ];

  try {
    const existingTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const existingTableNames = existingTables.rows.map(r => r.table_name);
    const missingTables = requiredTables.filter(t => !existingTableNames.includes(t));

    return {
      initialized: missingTables.length === 0,
      missingTables: missingTables,
      existingTableCount: existingTableNames.length
    };
  } catch (error) {
    console.error('Error checking database initialization:', error);
    return {
      initialized: false,
      missingTables: requiredTables,
      error: error.message
    };
  }
}

module.exports = {
  autoInitializeDatabase,
  checkDatabaseInitialization
};

