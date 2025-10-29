require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function initFinal() {
  console.log('🔄 Resetting and initializing database (final-init)...');
  try {
    const sqlPath = path.join(__dirname, 'final-init.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');

    // Expand psql include directives (\\i filename) manually since pool.query doesn't support them
    const includeRegex = /^\\i\s+(.+)$/gim;
    sql = sql.replace(includeRegex, (_, includeFile) => {
      const includePath = path.join(__dirname, includeFile.trim());
      if (fs.existsSync(includePath)) {
        console.log('📦 Including SQL file:', includeFile.trim());
        return fs.readFileSync(includePath, 'utf8');
      }
      console.warn('⚠️ Include file not found:', includePath);
      return '';
    });

    // Generate admin password hash
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(password, 10);
    sql = sql.replace('$2b$10$YourHashWillBeGeneratedHere', hash);

    // Split by GO-like separators is not needed; execute in one batch
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('⚠️ final-init.sql execution error (continuing to AI schema):', e.message);
    }

    // Apply AI trading schema additions
    const aiSchemaPath = path.join(__dirname, 'ai-trading-schema.sql');
    if (fs.existsSync(aiSchemaPath)) {
      console.log('📈 Applying AI trading schema...');
      const aiSql = fs.readFileSync(aiSchemaPath, 'utf8');
      await pool.query(aiSql);
      console.log('✅ AI trading schema applied');
    } else {
      console.warn('⚠️ AI trading schema file not found, skipping:', aiSchemaPath);
    }

    console.log('✅ Database initialized successfully');
    console.log('👤 Admin login: admin@uobsecurity.com /', password);
  } catch (err) {
    console.error('❌ init-final error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  initFinal().then(() => process.exit(0));
}

module.exports = { initFinal };


