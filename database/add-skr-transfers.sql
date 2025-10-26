-- Create skr_transfers table for logging SKR transfers
CREATE TABLE IF NOT EXISTS skr_transfers (
    id SERIAL PRIMARY KEY,
    skr_id INTEGER NOT NULL REFERENCES gold_holdings(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transfer_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_skr_transfers_skr_id ON skr_transfers(skr_id);
CREATE INDEX IF NOT EXISTS idx_skr_transfers_from_user ON skr_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_skr_transfers_to_user ON skr_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_skr_transfers_created_at ON skr_transfers(created_at);
