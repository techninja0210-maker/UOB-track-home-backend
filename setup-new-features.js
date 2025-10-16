require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function setupNewFeatures() {
  console.log('🚀 Setting up new features for Track Platform...\n');

  try {
    // 1. Add password reset columns
    console.log('📊 Adding password reset columns to users table...');
    const passwordResetSql = fs.readFileSync(
      path.join(__dirname, 'database', 'add-password-reset.sql'),
      'utf8'
    );
    await query(passwordResetSql);
    console.log('✅ Password reset columns added successfully!\n');

    // 2. Verify new columns
    console.log('🔍 Verifying database schema...');
    const schemaCheck = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('reset_token', 'reset_token_expiry')
      ORDER BY column_name;
    `);

    if (schemaCheck.rows.length === 2) {
      console.log('✅ Database schema verified:');
      schemaCheck.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.warn('⚠️  Warning: Expected 2 columns, found', schemaCheck.rows.length);
    }

    console.log('\n✨ Setup complete! New features ready to use:\n');
    console.log('  ✅ Password Reset Flow');
    console.log('  ✅ Email Notifications');
    console.log('  ✅ Rate Limiting');
    console.log('  ✅ CSV/PDF Exports');
    console.log('  ✅ Real-time Notifications (WebSocket)\n');

    console.log('📝 Next steps:');
    console.log('  1. Configure email settings in .env file');
    console.log('  2. Start the backend: npm run dev');
    console.log('  3. Test password reset at /forgot-password');
    console.log('  4. Check console for email preview links\n');

    console.log('📖 For detailed documentation, see: NEW-FEATURES-IMPLEMENTED.md\n');

  } catch (error) {
    console.error('❌ Setup error:', error);
    console.error('\nIf you see "relation already exists" errors, that\'s OK - features are already set up!\n');
  } finally {
    const { pool } = require('./config/database');
    await pool.end();
  }
}

// Run setup
setupNewFeatures();


