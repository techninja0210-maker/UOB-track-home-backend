const { query } = require('./config/database');

async function initCrowdfunding() {
  try {
    console.log('Initializing crowdfunding tables...');
    
    // Check if tables exist
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'crowdfunding%'
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('Creating crowdfunding tables...');
      
      // Create crowdfunding_contracts table
      await query(`
        CREATE TABLE IF NOT EXISTS crowdfunding_contracts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          target_amount DECIMAL(20, 8) NOT NULL,
          current_amount DECIMAL(20, 8) DEFAULT 0,
          minimum_investment DECIMAL(20, 8) DEFAULT 100,
          maximum_investment DECIMAL(20, 8),
          currency VARCHAR(10) DEFAULT 'USDT',
          status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          image_url VARCHAR(500),
          contract_type VARCHAR(20) DEFAULT 'gold' CHECK (contract_type IN ('gold', 'oil')),
          profit_percentage DECIMAL(5, 2) DEFAULT 1.00,
          contract_duration_months INTEGER DEFAULT 12,
          is_target_reached BOOLEAN DEFAULT FALSE,
          profit_distributed BOOLEAN DEFAULT FALSE
        );
      `);
      
      // Create crowdfunding_investments table
      await query(`
        CREATE TABLE IF NOT EXISTS crowdfunding_investments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          contract_id UUID REFERENCES crowdfunding_contracts(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          amount DECIMAL(20, 8) NOT NULL,
          currency VARCHAR(10) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          transaction_hash VARCHAR(255),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          admin_notes TEXT,
          profit_amount DECIMAL(20, 8) DEFAULT 0,
          profit_paid BOOLEAN DEFAULT FALSE,
          profit_paid_date TIMESTAMP,
          profit_payment_hash VARCHAR(255)
        );
      `);
      
      console.log('✅ Crowdfunding tables created successfully');
    } else {
      console.log('✅ Crowdfunding tables already exist');
    }
    
  } catch (error) {
    if (error.code === '42501') {
      console.log('⚠️  Crowdfunding tables cannot be created due to database permissions');
      console.log('   This is normal for restricted database users');
      console.log('   Crowdfunding features will be limited until tables are created manually');
    } else {
      console.error('❌ Error initializing crowdfunding:', error.message);
    }
  }
}

module.exports = initCrowdfunding;
