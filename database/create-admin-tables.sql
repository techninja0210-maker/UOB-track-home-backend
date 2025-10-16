-- Create SKRs table
CREATE TABLE IF NOT EXISTS skrs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skr_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    storage_location VARCHAR(255),
    gold_weight DECIMAL(10,4),
    gold_purity DECIMAL(5,2) DEFAULT 99.9,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'redeemed', 'pending')),
    issued_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create gold_settings table
CREATE TABLE IF NOT EXISTS gold_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    markup_percentage DECIMAL(5,2) DEFAULT 2.5,
    spread_percentage DECIMAL(5,2) DEFAULT 0.5,
    minimum_order DECIMAL(10,4) DEFAULT 1,
    maximum_order DECIMAL(10,4) DEFAULT 1000,
    auto_update BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_skrs_user_id ON skrs(user_id);
CREATE INDEX IF NOT EXISTS idx_skrs_status ON skrs(status);
CREATE INDEX IF NOT EXISTS idx_skrs_issued_date ON skrs(issued_date);
CREATE INDEX IF NOT EXISTS idx_skrs_expiry_date ON skrs(expiry_date);

-- Insert default gold settings if none exist
INSERT INTO gold_settings (markup_percentage, spread_percentage, minimum_order, maximum_order, auto_update)
SELECT 2.5, 0.5, 1, 1000, true
WHERE NOT EXISTS (SELECT 1 FROM gold_settings);

-- Add some sample SKRs for testing
INSERT INTO skrs (skr_number, user_id, storage_location, gold_weight, gold_purity, status, issued_date, expiry_date)
SELECT 
    'SKR-' || LPAD(EXTRACT(EPOCH FROM NOW())::text, 10, '0') || '-' || i,
    (SELECT id FROM users LIMIT 1),
    'Vault ' || (i % 3 + 1),
    ROUND((RANDOM() * 100 + 10)::numeric, 4),
    99.9,
    CASE WHEN i % 4 = 0 THEN 'expired' ELSE 'active' END,
    NOW() - INTERVAL '1 day' * (i % 30),
    NOW() + INTERVAL '1 year' - INTERVAL '1 day' * (i % 30)
FROM generate_series(1, 5) AS i
WHERE NOT EXISTS (SELECT 1 FROM skrs LIMIT 1);

