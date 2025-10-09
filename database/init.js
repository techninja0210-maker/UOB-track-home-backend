require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function initializeDatabase() {
  console.log('🔄 Initializing PostgreSQL database...');
  
  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    let schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Generate proper admin password hash
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Replace placeholder with actual hash
    schema = schema.replace('$2b$10$YourHashWillBeGeneratedHere', hashedPassword);
    
    // Execute schema
    await pool.query(schema);
    
    console.log('✅ Database schema created successfully');
    console.log('✅ Admin user created: admin@uobsecurity.com / admin123');
    console.log('✅ Sample receipts data loaded');
    console.log('✅ Database ready for use!');
    
    // Get statistics
    const stats = await pool.query('SELECT * FROM receipt_statistics');
    console.log('📊 Database Statistics:', stats.rows[0]);
    
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Database initialization complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
