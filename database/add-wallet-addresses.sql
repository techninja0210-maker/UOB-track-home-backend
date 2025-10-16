-- ============================================
-- Add Wallet Addresses and Deposit System
-- ============================================

-- Add address columns to wallets table
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS btc_address VARCHAR(100) UNIQUE;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS eth_address VARCHAR(100) UNIQUE;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS usdt_address VARCHAR(100) UNIQUE;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS btc_private_key_encrypted TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS eth_private_key_encrypted TEXT;

-- Create deposit_requests table
CREATE TABLE IF NOT EXISTS deposit_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
  amount NUMERIC(20, 18) NOT NULL CHECK (amount > 0),
  wallet_address VARCHAR(100) NOT NULL,
  transaction_hash VARCHAR(255) UNIQUE,
  from_address VARCHAR(100),
  confirmations INTEGER DEFAULT 0,
  required_confirmations INTEGER DEFAULT 6,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'completed', 'failed', 'cancelled')),
  detected_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  credited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
  amount NUMERIC(20, 18) NOT NULL CHECK (amount > 0),
  destination_address VARCHAR(100) NOT NULL,
  fee NUMERIC(20, 18) DEFAULT 0,
  net_amount NUMERIC(20, 18) NOT NULL,
  transaction_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled', 'rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  admin_notes TEXT,
  rejection_reason TEXT
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposit_requests(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_wallets_btc_address ON wallets(btc_address);
CREATE INDEX IF NOT EXISTS idx_wallets_eth_address ON wallets(eth_address);

-- Create blockchain_monitoring table (tracks last checked block)
CREATE TABLE IF NOT EXISTS blockchain_monitoring (
  id SERIAL PRIMARY KEY,
  blockchain VARCHAR(10) UNIQUE NOT NULL CHECK (blockchain IN ('BTC', 'ETH')),
  last_block_checked BIGINT NOT NULL DEFAULT 0,
  last_check_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_syncing BOOLEAN DEFAULT false,
  sync_error TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize blockchain monitoring
INSERT INTO blockchain_monitoring (blockchain, last_block_checked) 
VALUES ('BTC', 0), ('ETH', 0)
ON CONFLICT (blockchain) DO NOTHING;

-- Create master_wallet table (platform's main wallet)
CREATE TABLE IF NOT EXISTS master_wallet (
  id SERIAL PRIMARY KEY,
  currency VARCHAR(10) UNIQUE NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
  address VARCHAR(100) NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  balance NUMERIC(20, 18) DEFAULT 0,
  last_balance_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_deposit_requests_timestamp ON deposit_requests;
CREATE TRIGGER update_deposit_requests_timestamp
  BEFORE UPDATE ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_withdrawal_requests_timestamp ON withdrawal_requests;
CREATE TRIGGER update_withdrawal_requests_timestamp
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_wallets_timestamp ON wallets;
CREATE TRIGGER update_wallets_timestamp
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

