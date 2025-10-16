-- Pool wallet system schema updates

-- Create pool_deposits table to track deposits to pool wallet
CREATE TABLE IF NOT EXISTS pool_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    pool_address VARCHAR(255) NOT NULL,
    transaction_hash VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'cancelled')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pool_deposits_status ON pool_deposits(status);
CREATE INDEX IF NOT EXISTS idx_pool_deposits_transaction_hash ON pool_deposits(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_pool_deposits_user_id ON pool_deposits(user_id);

-- Remove private key columns from wallets table (no longer needed for pool wallet system)
-- Note: This is commented out for safety. Uncomment only if you're sure you want to remove these columns.
-- ALTER TABLE wallets DROP COLUMN IF EXISTS btc_private_key_encrypted;
-- ALTER TABLE wallets DROP COLUMN IF EXISTS eth_private_key_encrypted;

-- Add pool wallet configuration table
CREATE TABLE IF NOT EXISTS pool_wallet_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) UNIQUE NOT NULL,
    pool_address VARCHAR(255) NOT NULL,
    pool_private_key_encrypted TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default pool wallet configuration (will be populated by the service)
INSERT INTO pool_wallet_config (currency, pool_address, is_active) VALUES 
    ('BTC', 'PLACEHOLDER_BTC_ADDRESS', true),
    ('ETH', 'PLACEHOLDER_ETH_ADDRESS', true),
    ('USDT', 'PLACEHOLDER_USDT_ADDRESS', true)
ON CONFLICT (currency) DO NOTHING;

-- Create admin pool management table
CREATE TABLE IF NOT EXISTS pool_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    destination_address VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    transaction_hash VARCHAR(255),
    admin_notes TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create indexes for pool withdrawals
CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_status ON pool_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_pool_withdrawals_user_id ON pool_withdrawals(user_id);

SELECT 'Pool wallet schema updated successfully' AS status;
