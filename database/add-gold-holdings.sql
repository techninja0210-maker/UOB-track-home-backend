-- ====================================================
-- Gold Holdings Table (for tracking digital gold credits)
-- ====================================================

-- Create gold_holdings table if it doesn't exist
CREATE TABLE IF NOT EXISTS gold_holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_grams NUMERIC(20, 4) NOT NULL,
  purchase_price_per_gram NUMERIC(20, 2) NOT NULL,
  total_value_usd NUMERIC(20, 2),
  source_crypto VARCHAR(10), -- BTC, ETH, USDT (which crypto was exchanged)
  source_crypto_amount NUMERIC(20, 8),
  fee_grams NUMERIC(20, 4) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'shipped', 'cancelled')),
  
  -- Shipment tracking
  shipment_tracking_number VARCHAR(255),
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  redeemed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_gold_holdings_user_id ON gold_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_status ON gold_holdings(status);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_created_at ON gold_holdings(created_at DESC);

-- ====================================================
-- Update gold_price_history to include API source
-- ====================================================

-- Add source column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='gold_price_history' AND column_name='source'
    ) THEN
        ALTER TABLE gold_price_history ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
    END IF;
END $$;

-- ====================================================
-- Add environment variable placeholder
-- ====================================================

-- Note: Add this to backend/.env file:
-- METALS_DEV_API_KEY=your_api_key_here (or use 'demo' for testing)

COMMENT ON TABLE gold_holdings IS 'Tracks user digital gold credits from crypto exchanges';
COMMENT ON COLUMN gold_holdings.weight_grams IS 'Amount of gold in grams';
COMMENT ON COLUMN gold_holdings.status IS 'active=held digitally, redeemed=converted back to crypto, shipped=physical delivery in progress';
COMMENT ON COLUMN gold_holdings.source_crypto IS 'Which cryptocurrency was exchanged for this gold';



