-- ============================================================================
-- PRODUCTION-READY DATABASE INITIALIZATION (SAFE VERSION)
-- Gold Trading Platform - Complete Schema
-- ============================================================================
-- This version uses CREATE TABLE IF NOT EXISTS instead of DROP TABLE
-- Safe to run on existing databases without dropping data
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- CORE ENTITIES
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    two_factor_enabled BOOLEAN DEFAULT FALSE,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, weight_grams)
);

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
CREATE OR REPLACE FUNCTION update_updated_at_column()
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
CREATE OR REPLACE FUNCTION update_contract_amount()
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
CREATE OR REPLACE FUNCTION check_and_distribute_profits()
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
CREATE OR REPLACE FUNCTION calculate_bot_performance(p_bot_id UUID, p_date DATE)
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

CREATE OR REPLACE FUNCTION insert_gold_security_safe(
    p_name VARCHAR(100),
    p_weight_grams NUMERIC(20,8),
    p_premium_usd NUMERIC(20,8)
) RETURNS VOID AS $$
DECLARE
    v_exists BOOLEAN;
    v_cols TEXT := 'name, weight_grams';
    v_vals TEXT;
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
    
    -- Build values - start with required columns
    v_vals := format('(%L, %s', p_name, p_weight_grams);
    
    -- Always include premium_usd if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'premium_usd') THEN
        v_cols := v_cols || ', premium_usd';
        v_vals := v_vals || format(', %s', p_premium_usd);
    END IF;
    
    -- Add optional columns if they exist (include all that might be NOT NULL)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'purity') THEN
        v_cols := v_cols || ', purity';
        v_vals := v_vals || ', 999';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'price_per_gram_usd') THEN
        v_cols := v_cols || ', price_per_gram_usd';
        v_vals := v_vals || format(', %s', v_price_per_gram);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'total_price_usd') THEN
        v_cols := v_cols || ', total_price_usd';
        v_vals := v_vals || format(', %s', v_total_price);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'available_quantity') THEN
        v_cols := v_cols || ', available_quantity';
        v_vals := v_vals || ', 0';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gold_securities' AND column_name = 'is_active') THEN
        v_cols := v_cols || ', is_active';
        v_vals := v_vals || ', true';
    END IF;
    
    v_vals := v_vals || ')';
    
    -- Execute dynamic INSERT
    EXECUTE format('INSERT INTO gold_securities (%s) VALUES %s', v_cols, v_vals);
EXCEPTION
    WHEN others THEN
        -- Log error but don't fail (for debugging)
        RAISE NOTICE 'Error inserting gold security %: %', p_name, SQLERRM;
        -- Re-raise to see the actual error
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION: Add missing columns and constraints to existing tables
-- ============================================================================

-- Add premium_usd column to gold_securities if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'premium_usd'
    ) THEN
        ALTER TABLE gold_securities ADD COLUMN premium_usd NUMERIC(20,8) DEFAULT 0;
    END IF;
END $$;

-- Handle all missing columns in gold_securities table
DO $$ 
BEGIN
    -- Handle purity column - make it nullable or add default if it exists and is NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'purity'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'gold_securities' 
            AND column_name = 'purity' 
            AND is_nullable = 'NO'
        ) THEN
            -- First make it nullable
            ALTER TABLE gold_securities 
            ALTER COLUMN purity DROP NOT NULL,
            ALTER COLUMN purity SET DEFAULT 999;
            
            -- Set default for existing NULL rows (if any)
            UPDATE gold_securities SET purity = 999 WHERE purity IS NULL;
        END IF;
    ELSE
        -- Add the column if it doesn't exist
        ALTER TABLE gold_securities 
        ADD COLUMN purity NUMERIC(20,8) DEFAULT 999;
    END IF;
    
    -- Handle price_per_gram_usd column - add if missing or make nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'price_per_gram_usd'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'gold_securities' 
            AND column_name = 'price_per_gram_usd' 
            AND is_nullable = 'NO'
        ) THEN
            -- First make it nullable (this allows NULL values)
            ALTER TABLE gold_securities 
            ALTER COLUMN price_per_gram_usd DROP NOT NULL;
            
            -- Then set default value
            ALTER TABLE gold_securities 
            ALTER COLUMN price_per_gram_usd SET DEFAULT 60.0;
            
            -- Set default price for existing NULL rows (if any)
            UPDATE gold_securities 
            SET price_per_gram_usd = 60.0 
            WHERE price_per_gram_usd IS NULL;
        END IF;
    ELSE
        -- Add the column if it doesn't exist
        ALTER TABLE gold_securities 
        ADD COLUMN price_per_gram_usd NUMERIC(20,8) DEFAULT 60.0;
    END IF;
    
    -- Handle total_price_usd column - add if missing or make nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'total_price_usd'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'gold_securities' 
            AND column_name = 'total_price_usd' 
            AND is_nullable = 'NO'
        ) THEN
            -- First make it nullable
            ALTER TABLE gold_securities 
            ALTER COLUMN total_price_usd DROP NOT NULL;
            
            -- Calculate total_price_usd for existing rows (if any)
            UPDATE gold_securities 
            SET total_price_usd = COALESCE(price_per_gram_usd, 60.0) * weight_grams
            WHERE total_price_usd IS NULL;
        END IF;
    ELSE
        -- Add the column if it doesn't exist
        ALTER TABLE gold_securities 
        ADD COLUMN total_price_usd NUMERIC(20,8);
    END IF;
    
    -- Handle available_quantity column - add if missing or make nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'available_quantity'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'gold_securities' 
            AND column_name = 'available_quantity' 
            AND is_nullable = 'NO'
        ) THEN
            -- First make it nullable
            ALTER TABLE gold_securities 
            ALTER COLUMN available_quantity DROP NOT NULL,
            ALTER COLUMN available_quantity SET DEFAULT 0;
            
            -- Set default for existing NULL rows (if any)
            UPDATE gold_securities SET available_quantity = 0 WHERE available_quantity IS NULL;
        END IF;
    ELSE
        -- Add the column if it doesn't exist
        ALTER TABLE gold_securities 
        ADD COLUMN available_quantity INTEGER DEFAULT 0;
    END IF;
    
    -- Handle description column - add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'description'
    ) THEN
        ALTER TABLE gold_securities ADD COLUMN description TEXT;
    END IF;
    
    -- Handle image_url column - add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE gold_securities ADD COLUMN image_url VARCHAR(500);
    END IF;
    
    -- Handle is_active column - add if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE gold_securities ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add UNIQUE constraint on crypto_currencies.symbol if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'crypto_currencies_symbol_key' 
        OR (conrelid = 'crypto_currencies'::regclass AND contype = 'u')
    ) THEN
        -- Check if constraint exists on symbol column
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'crypto_currencies' 
            AND tc.constraint_type = 'UNIQUE'
            AND kcu.column_name = 'symbol'
        ) THEN
            ALTER TABLE crypto_currencies ADD CONSTRAINT crypto_currencies_symbol_key UNIQUE (symbol);
        END IF;
    END IF;
END $$;

-- Add UNIQUE constraint on gold_securities(name, weight_grams) if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'gold_securities' 
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name IN ('name', 'weight_grams')
        GROUP BY tc.constraint_name
        HAVING COUNT(DISTINCT kcu.column_name) = 2
    ) THEN
        -- Check if constraint with both columns exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'gold_securities'
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 2
        ) THEN
            ALTER TABLE gold_securities ADD CONSTRAINT gold_securities_name_weight_grams_key UNIQUE (name, weight_grams);
        END IF;
    END IF;
END $$;

-- Add reset_token and reset_token_expiry columns to users table if they don't exist
DO $$ 
BEGIN
    -- Add reset_token column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'reset_token'
    ) THEN
        ALTER TABLE users ADD COLUMN reset_token VARCHAR(255);
    END IF;
    
    -- Add reset_token_expiry column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'reset_token_expiry'
    ) THEN
        ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add TOTP secret column for 2FA if it doesn't exist
DO $$ 
BEGIN
    -- Add totp_secret column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'totp_secret'
    ) THEN
        ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255);
    END IF;
END $$;

-- ============================================================================
-- SEED DATA (Safe for production - minimal required data)
-- ============================================================================

-- Crypto currencies (safe insert with conflict handling)
DO $$
BEGIN
    -- Check if unique constraint exists on symbol
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'crypto_currencies' 
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'symbol'
    ) THEN
        -- Use ON CONFLICT if constraint exists
        INSERT INTO crypto_currencies (symbol, name, current_price_usd) VALUES
          ('BTC','Bitcoin', 50000),
          ('ETH','Ethereum', 2000),
          ('USDT','Tether', 1)
        ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name;
    ELSE
        -- Insert without ON CONFLICT if constraint doesn't exist
        INSERT INTO crypto_currencies (symbol, name, current_price_usd) 
        SELECT * FROM (VALUES
          ('BTC', 'Bitcoin', 50000::NUMERIC(20,8)),
          ('ETH', 'Ethereum', 2000::NUMERIC(20,8)),
          ('USDT', 'Tether', 1::NUMERIC(20,8))
        ) AS v(symbol, name, current_price_usd)
        WHERE NOT EXISTS (
            SELECT 1 FROM crypto_currencies cc WHERE cc.symbol = v.symbol
        );
    END IF;
END $$;

-- Gold products (safe insert with conflict handling)
DO $$
BEGIN
    -- Check if premium_usd column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gold_securities' AND column_name = 'premium_usd'
    ) THEN
        -- Check if unique constraint exists on (name, weight_grams)
        IF EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'gold_securities'
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 2
        ) THEN
            -- Use ON CONFLICT if constraint exists
            -- Use a function to safely insert with all columns
            PERFORM insert_gold_security_safe('Gold Bar 10g', 10.0000, 15);
            PERFORM insert_gold_security_safe('Gold Bar 100g', 100.0000, 50);
            PERFORM insert_gold_security_safe('Gold Bar 1kg', 1000.0000, 200);
        ELSE
            -- Insert without ON CONFLICT if constraint doesn't exist
            PERFORM insert_gold_security_safe('Gold Bar 10g', 10.0000, 15);
            PERFORM insert_gold_security_safe('Gold Bar 100g', 100.0000, 50);
            PERFORM insert_gold_security_safe('Gold Bar 1kg', 1000.0000, 200);
        END IF;
    ELSE
        -- Fallback: insert without premium_usd if column doesn't exist
        PERFORM insert_gold_security_safe('Gold Bar 10g', 10.0000, 0);
        PERFORM insert_gold_security_safe('Gold Bar 100g', 100.0000, 0);
        PERFORM insert_gold_security_safe('Gold Bar 1kg', 1000.0000, 0);
    END IF;
END $$;

-- Admin user (password will be replaced by init script)
DO $$ 
DECLARE
    admin_id_val UUID;
    password_hash_val VARCHAR(255);
BEGIN
    -- Get password hash from environment or use placeholder
    password_hash_val := '$2b$10$YourHashWillBeGeneratedHere';
    
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@uobsecurity.com') THEN
        INSERT INTO users (full_name, email, password_hash, role)
        VALUES ('Admin User', 'admin@uobsecurity.com', password_hash_val, 'admin')
        RETURNING id INTO admin_id_val;
        
        -- Create admin wallet (safe insert)
        IF NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = admin_id_val) THEN
            INSERT INTO wallets (user_id, btc_balance, usdt_balance, eth_balance)
            VALUES (admin_id_val, 0, 0, 0);
        END IF;
        
        -- Create referral earnings record for admin (safe insert)
        IF NOT EXISTS (SELECT 1 FROM referral_earnings WHERE user_id = admin_id_val) THEN
            INSERT INTO referral_earnings (user_id, total_commissions, total_bonuses, total_earnings, paid_earnings, pending_earnings)
            VALUES (admin_id_val, 0, 0, 0, 0, 0);
        END IF;
    END IF;
END $$;

