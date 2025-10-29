-- Final initialization SQL for a clean production-ready database
-- This file creates all required tables, views, indexes and minimal seed data.
-- It is safe to run on an empty database. It will DROP only known objects when present.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- =====================
-- Core entities
-- =====================

-- Users
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crypto reference data
DROP TABLE IF EXISTS crypto_currencies CASCADE;
CREATE TABLE crypto_currencies (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    current_price_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wallets (off-chain balances + deposit addresses)
DROP TABLE IF EXISTS wallets CASCADE;
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    btc_balance NUMERIC(38,18) NOT NULL DEFAULT 0,
    usdt_balance NUMERIC(38,18) NOT NULL DEFAULT 0,
    eth_balance NUMERIC(38,18) NOT NULL DEFAULT 0,
    btc_address VARCHAR(128),
    eth_address VARCHAR(128),
    usdt_address VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Gold products
DROP TABLE IF EXISTS gold_securities CASCADE;
CREATE TABLE gold_securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    weight_grams NUMERIC(20,8) NOT NULL,
    premium_usd NUMERIC(20,8) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gold holdings (SKR source). Matches exportService usage.
DROP TABLE IF EXISTS gold_holdings CASCADE;
CREATE TABLE gold_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gold_security_id UUID REFERENCES gold_securities(id),
    skr_reference VARCHAR(40) UNIQUE NOT NULL,
    weight_grams NUMERIC(20,8) NOT NULL,
    purchase_price_per_gram NUMERIC(20,8),
    total_paid_usd NUMERIC(20,8),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Receipts (legacy SKR builder feature)
DROP TABLE IF EXISTS receipts CASCADE;
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number VARCHAR(40) UNIQUE NOT NULL,
    date_of_issue TIMESTAMP WITH TIME ZONE,
    date_of_release TIMESTAMP WITH TIME ZONE,
    depositor_name VARCHAR(255),
    representative VARCHAR(255),
    depositors_address TEXT,
    type VARCHAR(100),
    date_of_initial_deposit TIMESTAMP WITH TIME ZONE,
    name_type VARCHAR(100),
    number_of_items INTEGER,
    charge_per_box NUMERIC(20,8),
    origin VARCHAR(100),
    declared_value NUMERIC(20,8),
    weight NUMERIC(20,8),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions (generic platform tx log)
DROP TABLE IF EXISTS transactions CASCADE;
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL, -- deposit, withdrawal, trade, purchase, sale
    currency VARCHAR(10) NOT NULL, -- BTC, ETH, USDT, GOLD
    amount NUMERIC(38,18) NOT NULL,
    fee NUMERIC(38,18) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    transaction_hash VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- Referrals, Withdrawals, Crowdfunding (from project files)
-- =====================

-- Referral subsystem
\i referral-schema.sql

-- Withdrawal requests
\i add-withdrawal-requests.sql

-- Crowdfunding optional tables
\i crowdfunding-schema.sql

-- =====================
-- Views and helper aggregates
-- =====================

-- Portfolio view used by admin
DROP VIEW IF EXISTS user_portfolios;
CREATE VIEW user_portfolios AS
SELECT 
  u.id AS user_id,
  u.full_name,
  u.email,
  COALESCE(w.btc_balance,0) AS btc_balance,
  COALESCE(w.usdt_balance,0) AS usdt_balance,
  COALESCE(w.eth_balance,0) AS eth_balance,
  (COALESCE(w.btc_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='BTC')) AS btc_value_usd,
  (COALESCE(w.usdt_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='USDT')) AS usdt_value_usd,
  (COALESCE(w.eth_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='ETH')) AS eth_value_usd,
  (
    (COALESCE(w.btc_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='BTC')) +
    (COALESCE(w.usdt_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='USDT')) +
    (COALESCE(w.eth_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='ETH'))
  ) AS total_crypto_value_usd,
  (
    SELECT COALESCE(SUM(gh.total_paid_usd),0) 
    FROM gold_holdings gh 
    WHERE gh.user_id = u.id
  ) AS total_gold_value_usd
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id;

-- =====================
-- Seed Data (minimal, safe for production start)
-- =====================

-- Crypto currencies
INSERT INTO crypto_currencies (symbol, name, current_price_usd) VALUES
  ('BTC','Bitcoin', 50000),
  ('ETH','Ethereum', 2000),
  ('USDT','Tether', 1)
ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name;

-- Gold products
INSERT INTO gold_securities (name, weight_grams, premium_usd) VALUES
  ('Gold Bar 10g', 10.0000, 15),
  ('Gold Bar 100g', 100.0000, 50),
  ('Gold Bar 1kg', 1000.0000, 200)
ON CONFLICT DO NOTHING;

-- Admin user (password replaced by init script)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@uobsecurity.com') THEN
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES ('Admin User', 'admin@uobsecurity.com', '$2b$10$YourHashWillBeGeneratedHere', 'admin');
  END IF;
END $$;

-- Create admin wallet row
INSERT INTO wallets (user_id, btc_balance, usdt_balance, eth_balance)
SELECT id, 0, 0, 0 FROM users WHERE email = 'admin@uobsecurity.com'
ON CONFLICT DO NOTHING;

-- Example SKR product for testing (no PII, safe to keep)
-- Comment out if you want a 100% empty state
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM gold_holdings) THEN
    INSERT INTO gold_holdings (user_id, gold_security_id, skr_reference, weight_grams, purchase_price_per_gram, total_paid_usd, status)
    SELECT u.id, gs.id, 'SKR' || to_char(EXTRACT(EPOCH FROM NOW())::bigint, 'FM9999999999'), 0.1499, 75.00, 11.24, 'active'
    FROM users u
    CROSS JOIN LATERAL (SELECT id FROM gold_securities ORDER BY weight_grams LIMIT 1) gs
    WHERE u.email = 'admin@uobsecurity.com'
    LIMIT 1;
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_user_id ON gold_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_skr ON gold_holdings(skr_reference);

-- Done
-- The init script will replace the admin password hash placeholder before executing.


