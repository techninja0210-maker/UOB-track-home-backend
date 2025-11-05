-- ============================================================================
-- CLEAR TEST DATA (Preserves Seed Data)
-- ============================================================================
-- This script clears test/transaction data while preserving:
-- - Admin user and seed data
-- - Crypto currencies (BTC, ETH, USDT)
-- - Gold securities/products
-- - Schema structure
-- ============================================================================

-- Clear transaction data (in order of dependencies)
-- Use conditional deletion to handle tables that might not exist
DO $$ 
BEGIN
    -- Transaction data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions_ledger') THEN
        DELETE FROM transactions_ledger;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        DELETE FROM transactions;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawals') THEN
        DELETE FROM withdrawals;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
        DELETE FROM withdrawal_requests;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests') THEN
        DELETE FROM deposit_requests;
    END IF;
    
    -- Trading data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trading_bots') THEN
        TRUNCATE TABLE trading_bots CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bot_performance') THEN
        TRUNCATE TABLE bot_performance CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'risk_limits') THEN
        TRUNCATE TABLE risk_limits CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_data') THEN
        TRUNCATE TABLE market_data CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exchange_accounts') THEN
        TRUNCATE TABLE exchange_accounts CASCADE;
    END IF;
    
    -- SKR/Receipt data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skrs') THEN
        TRUNCATE TABLE skrs CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') THEN
        TRUNCATE TABLE receipts CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gold_holdings') THEN
        TRUNCATE TABLE gold_holdings CASCADE;
    END IF;
    
    -- Referral data (must clear child tables first)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commissions') THEN
        TRUNCATE TABLE referral_commissions CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_bonuses') THEN
        TRUNCATE TABLE referral_bonuses CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_earnings') THEN
        TRUNCATE TABLE referral_earnings CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') THEN
        TRUNCATE TABLE referrals CASCADE;
    END IF;
    
    -- User balances
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_balances') THEN
        TRUNCATE TABLE user_balances CASCADE;
    END IF;
    
    -- Crowdfunding data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crowdfunding_contracts') THEN
        TRUNCATE TABLE crowdfunding_contracts CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crowdfunding_investments') THEN
        TRUNCATE TABLE crowdfunding_investments CASCADE;
    END IF;
    
    -- Sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        TRUNCATE TABLE sessions CASCADE;
    END IF;
END $$;

-- Clear user portfolios view data (if it's a table)
-- Note: This is usually a VIEW, so no data to clear

-- Clear all child tables that reference users before deleting users
-- This ensures foreign key constraints are satisfied
-- Note: We already cleared deposit_requests above, but ensure it's cleared for admin too if needed

-- Reset wallet balances to 0 (but keep wallet records)
UPDATE wallets 
SET 
    btc_balance = 0,
    usdt_balance = 0,
    eth_balance = 0
WHERE user_id != (SELECT id FROM users WHERE email = 'admin@uobsecurity.com' LIMIT 1);

-- Clear test wallets (but keep admin wallet)
DELETE FROM wallets 
WHERE user_id NOT IN (SELECT id FROM users WHERE email = 'admin@uobsecurity.com');

-- Clear user referral codes (but keep admin)
DELETE FROM user_referral_codes 
WHERE user_id NOT IN (SELECT id FROM users WHERE email = 'admin@uobsecurity.com');

-- Clear any remaining references to test users
DELETE FROM sessions 
WHERE user_id NOT IN (SELECT id FROM users WHERE email = 'admin@uobsecurity.com');

DELETE FROM user_balances 
WHERE user_id NOT IN (SELECT id FROM users WHERE email = 'admin@uobsecurity.com');

-- Clear test users (but keep admin) - must be last
DELETE FROM users 
WHERE email != 'admin@uobsecurity.com' 
AND role != 'admin';

-- Reset referral earnings (but keep admin record)
UPDATE referral_earnings 
SET 
    total_commissions = 0,
    total_bonuses = 0,
    total_earnings = 0,
    paid_earnings = 0,
    pending_earnings = 0
WHERE user_id != (SELECT id FROM users WHERE email = 'admin@uobsecurity.com' LIMIT 1);

-- Clear pool wallet transaction data (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pool_wallet_transactions') THEN
        TRUNCATE TABLE pool_wallet_transactions CASCADE;
    END IF;
END $$;

-- Note: The following are preserved:
-- ✅ Admin user (admin@uobsecurity.com)
-- ✅ Crypto currencies (BTC, ETH, USDT)
-- ✅ Gold securities (Gold Bar products)
-- ✅ Admin wallet
-- ✅ All table structures, indexes, triggers, views

