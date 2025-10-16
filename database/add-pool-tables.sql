-- Create pool_deposits table to record deposits received by pool wallet addresses
CREATE TABLE IF NOT EXISTS pool_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    pool_address VARCHAR(255) NOT NULL,
    transaction_hash VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
    sender_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


