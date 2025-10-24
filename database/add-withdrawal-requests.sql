-- Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
    amount DECIMAL(20, 8) NOT NULL CHECK (amount > 0),
    destination_address VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_notes TEXT,
    transaction_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_currency ON withdrawal_requests(currency);

-- Add comments for documentation
COMMENT ON TABLE withdrawal_requests IS 'User withdrawal requests that require admin approval';
COMMENT ON COLUMN withdrawal_requests.user_id IS 'User requesting the withdrawal';
COMMENT ON COLUMN withdrawal_requests.currency IS 'Cryptocurrency to withdraw (BTC, ETH, USDT)';
COMMENT ON COLUMN withdrawal_requests.amount IS 'Amount to withdraw';
COMMENT ON COLUMN withdrawal_requests.destination_address IS 'Blockchain address to send funds to';
COMMENT ON COLUMN withdrawal_requests.status IS 'Current status of the withdrawal request';
COMMENT ON COLUMN withdrawal_requests.admin_id IS 'Admin who processed the request';
COMMENT ON COLUMN withdrawal_requests.admin_notes IS 'Admin notes about the request';
COMMENT ON COLUMN withdrawal_requests.transaction_hash IS 'Blockchain transaction hash when completed';
COMMENT ON COLUMN withdrawal_requests.completed_at IS 'Timestamp when withdrawal was completed';
