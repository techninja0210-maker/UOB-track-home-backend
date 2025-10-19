-- ============================================
-- FRESH START MIGRATION (SAFEST OPTION)
-- ============================================
-- This script drops all existing tables and recreates them
-- Use this if you want to start completely fresh
-- WARNING: This will delete all existing data!

-- Drop all existing tables (in correct order to handle dependencies)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS gold_settings CASCADE;
DROP TABLE IF EXISTS gold_prices CASCADE;
DROP TABLE IF EXISTS skrs CASCADE;
DROP TABLE IF EXISTS gold_holdings CASCADE;
DROP TABLE IF EXISTS transactions_ledger CASCADE;
DROP TABLE IF EXISTS withdrawals CASCADE;
DROP TABLE IF EXISTS deposit_requests CASCADE;
DROP TABLE IF EXISTS user_balances CASCADE;
DROP TABLE IF EXISTS pool_addresses CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop any remaining views
DROP VIEW IF EXISTS user_summary CASCADE;
DROP VIEW IF EXISTS receipt_summary CASCADE;
DROP VIEW IF EXISTS balance_summary CASCADE;

-- Now run the final migration
-- ============================================
-- TRACK PLATFORM - FINAL DATABASE MIGRATION
-- ============================================
-- Execute this file in your Neon SQL editor
-- This creates ALL tables needed for the platform
-- NO LIMITS - Unlimited precision for all data

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ============================================
-- 1) USERS TABLE
-- ============================================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 2) SESSIONS TABLE
-- ============================================
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- 3) RECEIPTS TABLE (Your existing system)
-- ============================================
CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE NOT NULL,
  date_of_issue timestamptz NOT NULL,
  date_of_release timestamptz,
  depositor_name text NOT NULL,
  representative text,
  depositors_address text NOT NULL,
  type text NOT NULL,
  date_of_initial_deposit timestamptz NOT NULL,
  name_type text NOT NULL,
  number_of_items integer NOT NULL,
  charge_per_box numeric NOT NULL DEFAULT 0,
  origin text NOT NULL,
  declared_value numeric NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 4) POOL ADDRESSES (Auto-generated pool wallets)
-- ============================================
CREATE TABLE pool_addresses (
  currency text PRIMARY KEY, -- 'BTC'|'ETH'|'USDT'
  address text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz
);

-- ============================================
-- 5) USER BALANCES (Off-chain crypto credits)
-- ============================================
CREATE TABLE user_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  available_balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_balances UNIQUE (user_id, currency)
);
CREATE INDEX idx_user_balances_user_id ON user_balances(user_id);

-- ============================================
-- 6) DEPOSIT REQUESTS (Pool deposit tracking)
-- ============================================
CREATE TABLE deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  amount numeric NOT NULL,
  pool_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending'|'credited'|'failed'
  tx_hash text UNIQUE,
  detected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deposit_requests_user_id ON deposit_requests(user_id);
CREATE INDEX idx_deposit_requests_status ON deposit_requests(status);

-- ============================================
-- 7) WITHDRAWALS (User withdrawal requests)
-- ============================================
CREATE TABLE withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  amount numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  to_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'completed'|'failed'
  tx_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- ============================================
-- 8) TRANSACTIONS LEDGER (Immutable balance records)
-- ============================================
CREATE TABLE transactions_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL, -- 'deposit_credit','withdrawal_debit','buy_gold','sell_gold','transfer','fee','adjustment'
  currency text NOT NULL, -- 'BTC','ETH','USDT','GOLD'
  amount numeric NOT NULL, -- positive credit, negative debit
  reference_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_user_id_created_at ON transactions_ledger(user_id, created_at);
CREATE INDEX idx_ledger_reference_id ON transactions_ledger(reference_id);

-- ============================================
-- 9) GOLD HOLDINGS (User gold investments)
-- ============================================
CREATE TABLE gold_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grams numeric NOT NULL,
  purchase_price_usd numeric NOT NULL,
  current_price_usd numeric,
  status text NOT NULL DEFAULT 'holding', -- 'holding'|'sold'|'pending'
  reference_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gold_holdings_user_id ON gold_holdings(user_id);
CREATE INDEX idx_gold_holdings_status ON gold_holdings(status);

-- ============================================
-- 10) SKRS (Warehouse receipts)
-- ============================================
CREATE TABLE skrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skr_number text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  gold_weight_oz numeric NOT NULL,
  gold_purity numeric NOT NULL,
  storage_location text,
  status text NOT NULL, -- 'active'|'expired'|'redeemed'|'suspended'|'pending'
  created_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date
);
CREATE INDEX idx_skrs_user_id ON skrs(user_id);
CREATE INDEX idx_skrs_status ON skrs(status);

-- ============================================
-- 11) GOLD PRICES (Market data)
-- ============================================
CREATE TABLE gold_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL DEFAULT 'USD',
  price_per_oz numeric NOT NULL,
  price_per_gram numeric NOT NULL,
  change_24h numeric,
  source text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gold_prices_fetched_at ON gold_prices(fetched_at DESC);

-- ============================================
-- 12) GOLD SETTINGS (Platform configuration)
-- ============================================
CREATE TABLE gold_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  markup_percentage numeric NOT NULL DEFAULT 0,
  spread_percentage numeric NOT NULL DEFAULT 0,
  minimum_order_grams numeric NOT NULL DEFAULT 0,
  maximum_order_grams numeric NOT NULL DEFAULT 0,
  auto_update boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 13) NOTIFICATIONS (Real-time notifications)
-- ============================================
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ============================================
-- 14) AUDIT LOGS (Admin actions tracking)
-- ============================================
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id text,
  diff jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- ============================================
-- SEED DATA (Safe inserts)
-- ============================================

-- Insert default gold settings
INSERT INTO gold_settings (id) VALUES (gen_random_uuid());

-- Insert default pool address placeholders (will be overridden by auto-generation)
INSERT INTO pool_addresses(currency, address)
VALUES
  ('BTC',''),
  ('ETH',''),
  ('USDT','');

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Track Platform database created successfully with unlimited precision!' as message;
