-- ============================================
-- Track Platform - PostgreSQL Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- RECEIPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number VARCHAR(50) UNIQUE NOT NULL,
  date_of_issue TIMESTAMP NOT NULL,
  date_of_release TIMESTAMP,
  depositor_name VARCHAR(255) NOT NULL,
  representative VARCHAR(255),
  depositors_address TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Personal', 'Corporate', 'Government', 'Other')),
  date_of_initial_deposit TIMESTAMP NOT NULL,
  name_type VARCHAR(255) NOT NULL,
  number_of_items INTEGER NOT NULL CHECK (number_of_items > 0),
  charge_per_box NUMERIC(10, 2) NOT NULL CHECK (charge_per_box >= 0),
  origin VARCHAR(100) NOT NULL,
  declared_value NUMERIC(15, 2) NOT NULL CHECK (declared_value >= 0),
  weight NUMERIC(10, 2) NOT NULL CHECK (weight > 0),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'released', 'pending')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_receipts_reference ON receipts(reference_number);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_depositor ON receipts(depositor_name);

-- ============================================
-- FUTURE: CRYPTO WALLETS TABLE (Ready for future)
-- ============================================
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  btc_balance NUMERIC(20, 8) DEFAULT 0 CHECK (btc_balance >= 0),
  eth_balance NUMERIC(20, 18) DEFAULT 0 CHECK (eth_balance >= 0),
  usdt_balance NUMERIC(20, 2) DEFAULT 0 CHECK (usdt_balance >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ============================================
-- FUTURE: CRYPTO TRANSACTIONS TABLE (Ready for future)
-- ============================================
CREATE TABLE IF NOT EXISTS crypto_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  from_currency VARCHAR(10) NOT NULL,
  to_currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20, 18) NOT NULL CHECK (amount > 0),
  exchange_rate NUMERIC(20, 8) NOT NULL CHECK (exchange_rate > 0),
  fee NUMERIC(20, 8) DEFAULT 0 CHECK (fee >= 0),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  transaction_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crypto_tx_from_user ON crypto_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tx_to_user ON crypto_transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tx_status ON crypto_transactions(status);

-- ============================================
-- AUDIT LOG TABLE (For security and tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to receipts table
DROP TRIGGER IF EXISTS update_receipts_updated_at ON receipts;
CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to wallets table
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for receipt statistics
CREATE OR REPLACE VIEW receipt_statistics AS
SELECT 
  COUNT(*) as total_receipts,
  COUNT(*) FILTER (WHERE status = 'active') as active_receipts,
  COUNT(*) FILTER (WHERE status = 'released') as released_receipts,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_receipts,
  SUM(declared_value) as total_declared_value,
  AVG(declared_value) as avg_declared_value
FROM receipts;

-- ============================================
-- INITIAL ADMIN USER
-- ============================================
-- Password: admin123 (hashed with bcrypt)
INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Admin User', 'admin@uobsecurity.com', '$2b$10$YourHashWillBeGeneratedHere', 'admin')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- SAMPLE RECEIPTS DATA
-- ============================================
INSERT INTO receipts (
  reference_number, date_of_issue, date_of_release, depositor_name, representative,
  depositors_address, type, date_of_initial_deposit, name_type, number_of_items,
  charge_per_box, origin, declared_value, weight, status
) VALUES
  ('UOB12345678', '2024-01-15', NULL, 'John Smith', 'Jane Doe',
   '123 Main Street, New York, NY 10001', 'Personal', '2024-01-10',
   'Electronics', 5, 25.00, 'Singapore', 5000.00, 15.5, 'active'),
  
  ('UOB87654321', '2024-02-01', '2024-02-15', 'ABC Corporation', 'Robert Johnson',
   '456 Business Ave, Los Angeles, CA 90210', 'Corporate', '2024-01-28',
   'Documents', 12, 15.00, 'Malaysia', 12000.00, 8.2, 'released'),
  
  ('UOB11223344', '2024-03-10', NULL, 'Sarah Wilson', NULL,
   '789 Residential Rd, Chicago, IL 60601', 'Personal', '2024-03-05',
   'Jewelry', 3, 50.00, 'Thailand', 25000.00, 2.1, 'pending'),
  
  ('UOB55667788', '2024-03-20', NULL, 'Government Department', 'Michael Brown',
   '100 Government Building, Washington, DC 20001', 'Government', '2024-03-18',
   'Artifacts', 8, 100.00, 'Indonesia', 50000.00, 25.3, 'active'),
  
  ('UOB99887766', '2024-04-01', NULL, 'Tech Solutions Ltd', 'David Lee',
   '555 Technology Park, San Francisco, CA 94105', 'Corporate', '2024-03-28',
   'Equipment', 20, 30.00, 'Philippines', 75000.00, 45.8, 'active')
ON CONFLICT (reference_number) DO NOTHING;

-- ============================================
-- GRANT PERMISSIONS (if needed)
-- ============================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
