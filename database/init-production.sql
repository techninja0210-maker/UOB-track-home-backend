-- ============================================================================
-- PRODUCTION DATABASE INITIALIZATION - FINAL VERSION
-- Gold Trading Platform - Complete Schema
-- ============================================================================
-- This is the ONLY database file needed for production
-- Safe to run on existing databases (uses IF NOT EXISTS)
-- Run this file in your Neon SQL Editor or PostgreSQL client
-- ============================================================================

-- ============================================================================
-- STEP 1: GRANT PERMISSIONS (Required for Neon PostgreSQL)
-- ============================================================================

-- Grant CREATE permission on public schema (Neon-compatible)
GRANT CREATE ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO public;

-- Grant default privileges for tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO public;

-- ============================================================================
-- STEP 2: ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- STEP 3: CORE ENTITIES
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    totp_secret VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expiry TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crypto currencies reference data
CREATE TABLE IF NOT EXISTS crypto_currencies (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    current_price_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add last_updated column if it doesn't exist (for backward compatibility)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'crypto_currencies' AND column_name = 'last_updated'
    ) THEN
        ALTER TABLE crypto_currencies ADD COLUMN last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Crypto price history (for tracking price changes over time)
CREATE TABLE IF NOT EXISTS crypto_price_history (
    id SERIAL PRIMARY KEY,
    currency_symbol VARCHAR(10) NOT NULL,
    price_usd NUMERIC(20,8) NOT NULL,
    source VARCHAR(50) DEFAULT 'live_api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_crypto_price_history_symbol ON crypto_price_history(currency_symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_price_history_created_at ON crypto_price_history(created_at DESC);

-- Wallets (off-chain balances + deposit addresses)
CREATE TABLE IF NOT EXISTS wallets (
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

-- User balances table (used by userBalanceService)
CREATE TABLE IF NOT EXISTS user_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL,
    balance NUMERIC(38,18) NOT NULL DEFAULT 0,
    available_balance NUMERIC(38,18) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_balances UNIQUE (user_id, currency)
);

-- Gold securities/products
CREATE TABLE IF NOT EXISTS gold_securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    weight_grams NUMERIC(20,8) NOT NULL,
    premium_usd NUMERIC(20,8) DEFAULT 0,
    purity NUMERIC(20,8) DEFAULT 999,
    price_per_gram_usd NUMERIC(20,8) DEFAULT 60.0,
    total_price_usd NUMERIC(20,8),
    available_quantity INTEGER DEFAULT 0,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, weight_grams)
);

-- Gold price history (for tracking gold price changes over time)
-- Note: Created after gold_securities to allow foreign key reference
CREATE TABLE IF NOT EXISTS gold_price_history (
    id SERIAL PRIMARY KEY,
    gold_security_id UUID REFERENCES gold_securities(id) ON DELETE SET NULL,
    price_per_gram_usd NUMERIC(20,8) NOT NULL,
    total_price_usd NUMERIC(20,8),
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for gold_price_history
CREATE INDEX IF NOT EXISTS idx_gold_price_history_security_id ON gold_price_history(gold_security_id);
CREATE INDEX IF NOT EXISTS idx_gold_price_history_created_at ON gold_price_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gold_price_history_changed_by ON gold_price_history(changed_by);

-- Gold holdings (SKR source)
CREATE TABLE IF NOT EXISTS gold_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gold_security_id UUID REFERENCES gold_securities(id),
    skr_reference VARCHAR(40) UNIQUE NOT NULL,
    weight_grams NUMERIC(20,8) NOT NULL,
    purchase_price_per_gram NUMERIC(20,8),
    total_paid_usd NUMERIC(20,8),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'sold', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Receipts (legacy SKR builder feature)
CREATE TABLE IF NOT EXISTS receipts (
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

-- Transactions (generic platform transaction log)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount NUMERIC(38,18) NOT NULL,
    fee NUMERIC(38,18) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    transaction_hash VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Ledger (for detailed transaction tracking)
CREATE TABLE IF NOT EXISTS transactions_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount NUMERIC(38,18) NOT NULL,
    reference_id UUID,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DEPOSIT REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS deposit_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
    amount DECIMAL(20, 8),
    wallet_address VARCHAR(255),
    transaction_hash VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- WITHDRAWAL REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT')),
    amount DECIMAL(20, 8) NOT NULL CHECK (amount > 0),
    destination_address VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_notes TEXT,
    transaction_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- REFERRAL SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referred_id)
);

CREATE TABLE IF NOT EXISTS referral_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    transaction_amount DECIMAL(20,8) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(20,8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    bonus_type VARCHAR(50) NOT NULL,
    bonus_amount DECIMAL(20,8) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_commissions DECIMAL(20,8) DEFAULT 0,
    total_bonuses DECIMAL(20,8) DEFAULT 0,
    total_earnings DECIMAL(20,8) DEFAULT 0,
    paid_earnings DECIMAL(20,8) DEFAULT 0,
    pending_earnings DECIMAL(20,8) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================================================
-- CROWDFUNDING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS crowdfunding_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_amount DECIMAL(20, 8) NOT NULL,
    current_amount DECIMAL(20, 8) DEFAULT 0,
    minimum_investment DECIMAL(20, 8) DEFAULT 100,
    maximum_investment DECIMAL(20, 8),
    currency VARCHAR(10) DEFAULT 'USDT',
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    image_url VARCHAR(500),
    contract_type VARCHAR(20) DEFAULT 'gold' CHECK (contract_type IN ('gold', 'oil')),
    profit_percentage DECIMAL(5, 2) DEFAULT 1.00,
    contract_duration_months INTEGER DEFAULT 12,
    is_target_reached BOOLEAN DEFAULT FALSE,
    profit_distributed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS crowdfunding_investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES crowdfunding_contracts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    admin_notes TEXT,
    profit_amount DECIMAL(20, 8) DEFAULT 0,
    profit_paid BOOLEAN DEFAULT FALSE,
    profit_paid_date TIMESTAMP WITH TIME ZONE,
    profit_payment_hash VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS crowdfunding_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES crowdfunding_contracts(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_public BOOLEAN DEFAULT true
);

-- ============================================================================
-- AI TRADING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    strategy_type VARCHAR(50) NOT NULL CHECK (strategy_type IN ('sma_crossover', 'rsi_mean_reversion', 'bollinger_bands', 'momentum', 'dca')),
    status VARCHAR(20) NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'paused', 'error')),
    is_paper_trading BOOLEAN DEFAULT true,
    exchange VARCHAR(20) NOT NULL DEFAULT 'binance',
    trading_pairs JSONB NOT NULL DEFAULT '["BTCUSDT", "ETHUSDT"]',
    risk_settings JSONB NOT NULL DEFAULT '{"max_position_size_percent": 10, "stop_loss_percent": 2, "take_profit_percent": 4, "daily_loss_limit_percent": 5, "max_open_positions": 3}',
    strategy_params JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP WITH TIME ZONE,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    total_pnl DECIMAL(20,8) DEFAULT 0,
    daily_pnl DECIMAL(20,8) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'stopped', 'error')),
    initial_balance DECIMAL(20,8) NOT NULL,
    final_balance DECIMAL(20,8),
    total_pnl DECIMAL(20,8) DEFAULT 0,
    trades_count INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS bot_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
    session_id UUID REFERENCES bot_sessions(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    total_value DECIMAL(20,8) NOT NULL,
    fee DECIMAL(20,8) DEFAULT 0,
    order_id VARCHAR(100),
    exchange_order_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'failed')),
    signal_strength DECIMAL(5,4),
    strategy_signal VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    filled_at TIMESTAMP WITH TIME ZONE,
    pnl DECIMAL(20,8) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    signal_type VARCHAR(50) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    technical_indicators JSONB DEFAULT '{}',
    ai_analysis JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

CREATE TABLE IF NOT EXISTS market_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    open_time TIMESTAMP WITH TIME ZONE NOT NULL,
    close_time TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(20,8) NOT NULL,
    high_price DECIMAL(20,8) NOT NULL,
    low_price DECIMAL(20,8) NOT NULL,
    close_price DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, timeframe, open_time)
);

CREATE TABLE IF NOT EXISTS risk_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE,
    limit_type VARCHAR(50) NOT NULL,
    limit_value DECIMAL(20,8) NOT NULL,
    current_value DECIMAL(20,8) DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exchange_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange VARCHAR(20) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT NOT NULL,
    api_passphrase_encrypted TEXT,
    is_testnet BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS bot_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    total_pnl DECIMAL(20,8) DEFAULT 0,
    max_drawdown DECIMAL(20,8) DEFAULT 0,
    sharpe_ratio DECIMAL(10,4) DEFAULT 0,
    win_rate DECIMAL(5,4) DEFAULT 0,
    profit_factor DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_id, date)
);

-- ============================================================================
-- POOL ADDRESSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS pool_addresses (
    currency VARCHAR(10) PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    derivation_path VARCHAR(100),
    private_key_encrypted TEXT,
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled) WHERE two_factor_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_currency ON user_balances(currency);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_user_id ON transactions_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type ON transactions_ledger(type);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_created_at ON transactions_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_created_at ON deposit_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_user_id ON gold_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_skr ON gold_holdings(skr_reference);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_status ON gold_holdings(status);
CREATE INDEX IF NOT EXISTS idx_receipts_reference_number ON receipts(reference_number);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_currency ON withdrawal_requests(currency);
CREATE INDEX IF NOT EXISTS idx_user_referral_codes_user_id ON user_referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_referral_codes_code ON user_referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referral_id ON referral_commissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_referral_id ON referral_bonuses(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_status ON referral_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_user_id ON referral_earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contracts_status ON crowdfunding_contracts(status);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contracts_created_at ON crowdfunding_contracts(created_at);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_contract_id ON crowdfunding_investments(contract_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_user_id ON crowdfunding_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_status ON crowdfunding_investments(status);
CREATE INDEX IF NOT EXISTS idx_trading_bots_user_id ON trading_bots(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_bots_status ON trading_bots(status);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_id ON bot_sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_trades_bot_id ON bot_trades(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_trades_symbol ON bot_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_bot_trades_created_at ON bot_trades(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_signals_symbol ON ai_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_ai_signals_created_at ON ai_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timeframe ON market_data(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_market_data_open_time ON market_data(open_time);
CREATE INDEX IF NOT EXISTS idx_risk_limits_user_id ON risk_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user_id ON exchange_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_performance_bot_id ON bot_performance(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_performance_date ON bot_performance(date);

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Update timestamp trigger function
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers (only if trigger doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_wallets_updated_at') THEN
        CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_referral_codes_updated_at') THEN
        CREATE TRIGGER update_user_referral_codes_updated_at BEFORE UPDATE ON user_referral_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_referrals_updated_at') THEN
        CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crowdfunding_contracts_updated_at') THEN
        CREATE TRIGGER update_crowdfunding_contracts_updated_at BEFORE UPDATE ON crowdfunding_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_crowdfunding_investments_updated_at') THEN
        CREATE TRIGGER update_crowdfunding_investments_updated_at BEFORE UPDATE ON crowdfunding_investments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_trading_bots_updated_at') THEN
        CREATE TRIGGER update_trading_bots_updated_at BEFORE UPDATE ON trading_bots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Function to update contract current_amount when investment is confirmed
DROP FUNCTION IF EXISTS update_contract_amount() CASCADE;
CREATE FUNCTION update_contract_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
        UPDATE crowdfunding_contracts 
        SET current_amount = current_amount + NEW.amount
        WHERE id = NEW.contract_id;
    ELSIF OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
        UPDATE crowdfunding_contracts 
        SET current_amount = current_amount - OLD.amount
        WHERE id = NEW.contract_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contract_amount_trigger') THEN
        CREATE TRIGGER update_contract_amount_trigger
            AFTER UPDATE ON crowdfunding_investments
            FOR EACH ROW
            EXECUTE FUNCTION update_contract_amount();
    END IF;
END $$;

-- Function to check if contract target is reached and distribute profits
DROP FUNCTION IF EXISTS check_and_distribute_profits() CASCADE;
CREATE FUNCTION check_and_distribute_profits()
RETURNS TRIGGER AS $$
DECLARE
    contract_record RECORD;
    investment_record RECORD;
    total_profit DECIMAL(20, 8);
BEGIN
    SELECT * INTO contract_record 
    FROM crowdfunding_contracts 
    WHERE id = NEW.contract_id;
    
    IF contract_record.current_amount >= contract_record.target_amount 
       AND NOT contract_record.is_target_reached 
       AND contract_record.status = 'ongoing' THEN
        
        UPDATE crowdfunding_contracts 
        SET is_target_reached = TRUE, status = 'completed'
        WHERE id = NEW.contract_id;
        
        FOR investment_record IN 
            SELECT * FROM crowdfunding_investments 
            WHERE contract_id = NEW.contract_id AND status = 'confirmed'
        LOOP
            total_profit := investment_record.amount * (contract_record.profit_percentage / 100);
            UPDATE crowdfunding_investments 
            SET profit_amount = total_profit
            WHERE id = investment_record.id;
        END LOOP;
        
        UPDATE crowdfunding_contracts 
        SET profit_distributed = TRUE
        WHERE id = NEW.contract_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_profit_distribution_trigger') THEN
        CREATE TRIGGER check_profit_distribution_trigger
            AFTER UPDATE ON crowdfunding_contracts
            FOR EACH ROW
            EXECUTE FUNCTION check_and_distribute_profits();
    END IF;
END $$;

-- Function to calculate bot performance metrics
DROP FUNCTION IF EXISTS calculate_bot_performance(UUID, DATE) CASCADE;
CREATE FUNCTION calculate_bot_performance(p_bot_id UUID, p_date DATE)
RETURNS VOID AS $$
DECLARE
    v_total_trades INTEGER;
    v_winning_trades INTEGER;
    v_losing_trades INTEGER;
    v_total_pnl DECIMAL(20,8);
    v_win_rate DECIMAL(5,4);
BEGIN
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN pnl > 0 THEN 1 END),
        COUNT(CASE WHEN pnl < 0 THEN 1 END),
        COALESCE(SUM(pnl), 0)
    INTO v_total_trades, v_winning_trades, v_losing_trades, v_total_pnl
    FROM bot_trades 
    WHERE bot_id = p_bot_id 
    AND DATE(created_at) = p_date
    AND status = 'filled';
    
    v_win_rate := CASE WHEN v_total_trades > 0 THEN v_winning_trades::DECIMAL / v_total_trades ELSE 0 END;
    
    INSERT INTO bot_performance (bot_id, date, total_trades, winning_trades, losing_trades, total_pnl, win_rate)
    VALUES (p_bot_id, p_date, v_total_trades, v_winning_trades, v_losing_trades, v_total_pnl, v_win_rate)
    ON CONFLICT (bot_id, date) DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        winning_trades = EXCLUDED.winning_trades,
        losing_trades = EXCLUDED.losing_trades,
        total_pnl = EXCLUDED.total_pnl,
        win_rate = EXCLUDED.win_rate;
END;
$$ language 'plpgsql';

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW user_portfolios AS
SELECT 
  u.id AS user_id,
  u.full_name,
  u.email,
  COALESCE(w.btc_balance,0) AS btc_balance,
  COALESCE(w.usdt_balance,0) AS usdt_balance,
  COALESCE(w.eth_balance,0) AS eth_balance,
  (COALESCE(w.btc_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='BTC' LIMIT 1)) AS btc_value_usd,
  (COALESCE(w.usdt_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='USDT' LIMIT 1)) AS usdt_value_usd,
  (COALESCE(w.eth_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='ETH' LIMIT 1)) AS eth_value_usd,
  (
    (COALESCE(w.btc_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='BTC' LIMIT 1)) +
    (COALESCE(w.usdt_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='USDT' LIMIT 1)) +
    (COALESCE(w.eth_balance,0) * (SELECT current_price_usd FROM crypto_currencies WHERE symbol='ETH' LIMIT 1))
  ) AS total_crypto_value_usd,
  (
    SELECT COALESCE(SUM(gh.total_paid_usd),0) 
    FROM gold_holdings gh 
    WHERE gh.user_id = u.id
  ) AS total_gold_value_usd
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id;

-- ============================================================================
-- HELPER FUNCTION: Safe insert for gold_securities
-- ============================================================================

DROP FUNCTION IF EXISTS insert_gold_security_safe(VARCHAR, NUMERIC, NUMERIC) CASCADE;
CREATE FUNCTION insert_gold_security_safe(
    p_name VARCHAR(100),
    p_weight_grams NUMERIC(20,8),
    p_premium_usd NUMERIC(20,8)
) RETURNS VOID AS $$
DECLARE
    v_exists BOOLEAN;
    v_price_per_gram NUMERIC(20,8) := 60.0;
    v_total_price NUMERIC(20,8);
BEGIN
    -- Check if record already exists
    SELECT EXISTS(SELECT 1 FROM gold_securities WHERE name = p_name AND weight_grams = p_weight_grams) INTO v_exists;
    IF v_exists THEN
        RETURN; -- Skip if already exists
    END IF;
    
    -- Calculate total price
    v_total_price := v_price_per_gram * p_weight_grams;
    
    -- Insert with all columns
    INSERT INTO gold_securities (name, weight_grams, premium_usd, price_per_gram_usd, total_price_usd, available_quantity, is_active)
    VALUES (p_name, p_weight_grams, p_premium_usd, v_price_per_gram, v_total_price, 0, true);
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Error inserting gold security %: %', p_name, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Safe for production - minimal required data)
-- ============================================================================

-- Crypto currencies (safe insert with conflict handling)
DO $$
BEGIN
    INSERT INTO crypto_currencies (symbol, name, current_price_usd) VALUES
      ('BTC','Bitcoin', 50000),
      ('ETH','Ethereum', 2000),
      ('USDT','Tether', 1)
    ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name;
END $$;

-- Gold products (safe insert)
DO $$
BEGIN
    PERFORM insert_gold_security_safe('Gold Bar 10g', 10.0000, 15);
    PERFORM insert_gold_security_safe('Gold Bar 100g', 100.0000, 50);
    PERFORM insert_gold_security_safe('Gold Bar 1kg', 1000.0000, 200);
END $$;

-- ============================================================================
-- GRANT PERMISSIONS ON ALL TABLES
-- ============================================================================

-- Grant permissions on all tables to public role
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        BEGIN
            EXECUTE format('GRANT ALL ON TABLE %I TO public', r.tablename);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors (table might not exist or already has permissions)
            NULL;
        END;
    END LOOP;
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Database initialization completed successfully!';
    RAISE NOTICE '📊 All tables, functions, triggers, and indexes have been created.';
    RAISE NOTICE '🔐 Permissions have been granted.';
    RAISE NOTICE '🌱 Seed data has been inserted.';
END $$;


