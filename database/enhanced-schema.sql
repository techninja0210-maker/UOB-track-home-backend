-- ============================================
-- ENHANCED SCHEMA - Crypto & Gold Trading Platform
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CRYPTO CURRENCIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crypto_currencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  current_price_usd NUMERIC(20, 8) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert supported cryptocurrencies
INSERT INTO crypto_currencies (symbol, name, current_price_usd) VALUES
  ('BTC', 'Bitcoin', 60000.00000000),
  ('USDT', 'Tether', 1.00000000),
  ('ETH', 'Ethereum', 3000.00000000)
ON CONFLICT (symbol) DO NOTHING;

-- ============================================
-- GOLD SECURITIES TABLE (Gold Bars/Products)
-- ============================================
CREATE TABLE IF NOT EXISTS gold_securities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  weight_grams NUMERIC(10, 2) NOT NULL,
  purity VARCHAR(20) NOT NULL,
  price_per_gram_usd NUMERIC(15, 8) NOT NULL,
  total_price_usd NUMERIC(15, 2) NOT NULL,
  available_quantity INTEGER DEFAULT 0 CHECK (available_quantity >= 0),
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample gold securities
INSERT INTO gold_securities (name, weight_grams, purity, price_per_gram_usd, total_price_usd, available_quantity, description) VALUES
  ('1oz Gold Bar', 31.10, '999.9', 65.00000000, 2021.50, 100, 'Standard 1 troy ounce gold bar, 99.99% pure'),
  ('10g Gold Bar', 10.00, '999.9', 65.00000000, 650.00, 200, 'Portable 10 gram gold bar, investment grade'),
  ('100g Gold Bar', 100.00, '999.9', 64.50000000, 6450.00, 50, 'Premium 100 gram gold bar with certificate'),
  ('1kg Gold Bar', 1000.00, '999.9', 63.00000000, 63000.00, 10, 'Large format 1 kilogram gold bar for serious investors')
ON CONFLICT DO NOTHING;

-- ============================================
-- USER WALLETS TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Crypto Balances (exact precision)
  btc_balance NUMERIC(20, 8) DEFAULT 0 CHECK (btc_balance >= 0),
  usdt_balance NUMERIC(20, 2) DEFAULT 0 CHECK (usdt_balance >= 0),
  eth_balance NUMERIC(20, 18) DEFAULT 0 CHECK (eth_balance >= 0),
  
  -- Wallet addresses (external)
  btc_address VARCHAR(100),
  usdt_address VARCHAR(100),
  eth_address VARCHAR(100),
  
  -- Total portfolio value in USD (calculated)
  total_value_usd NUMERIC(20, 2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GOLD HOLDINGS TABLE (User's Gold Ownership)
-- ============================================
CREATE TABLE IF NOT EXISTS gold_holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gold_security_id UUID REFERENCES gold_securities(id),
  skr_reference VARCHAR(50) UNIQUE NOT NULL,
  
  -- Purchase details
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  weight_grams NUMERIC(10, 2) NOT NULL,
  purchase_price_per_gram NUMERIC(15, 8) NOT NULL,
  total_paid_usd NUMERIC(15, 2) NOT NULL,
  payment_currency VARCHAR(10) NOT NULL,
  payment_amount NUMERIC(20, 8) NOT NULL,
  
  -- Current status
  status VARCHAR(20) DEFAULT 'holding' CHECK (status IN ('holding', 'sold', 'withdrawn')),
  current_price_per_gram NUMERIC(15, 8),
  current_value_usd NUMERIC(15, 2),
  profit_loss_usd NUMERIC(15, 2),
  profit_loss_percentage NUMERIC(10, 2),
  
  -- Dates
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sell_date TIMESTAMP,
  withdrawal_date TIMESTAMP,
  holding_duration_days INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gold_holdings_user ON gold_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_skr ON gold_holdings(skr_reference);
CREATE INDEX IF NOT EXISTS idx_gold_holdings_status ON gold_holdings(status);

-- ============================================
-- TRANSACTIONS TABLE (All Platform Transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  
  -- Transaction type
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'deposit', 'withdrawal', 'gold_purchase', 'gold_sale', 
    'crypto_exchange', 'transfer_in', 'transfer_out'
  )),
  
  -- Transaction details
  from_currency VARCHAR(10),
  to_currency VARCHAR(10),
  from_amount NUMERIC(20, 18),
  to_amount NUMERIC(20, 18),
  
  -- For gold transactions
  gold_security_id UUID REFERENCES gold_securities(id),
  skr_reference VARCHAR(50),
  
  -- Exchange rate at time of transaction
  exchange_rate NUMERIC(20, 8),
  
  -- Fees
  platform_fee NUMERIC(20, 8) DEFAULT 0,
  network_fee NUMERIC(20, 8) DEFAULT 0,
  total_fee NUMERIC(20, 8) DEFAULT 0,
  
  -- Status and tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  transaction_hash VARCHAR(255),
  
  -- Merchant/Admin tracking
  merchant_wallet_address VARCHAR(100),
  admin_approval BOOLEAN DEFAULT false,
  admin_id UUID REFERENCES users(id),
  admin_notes TEXT,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_skr ON transactions(skr_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- ============================================
-- DEPOSIT REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deposit_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  wallet_address VARCHAR(100) NOT NULL,
  transaction_hash VARCHAR(255),
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'completed', 'failed')),
  confirmations INTEGER DEFAULT 0,
  required_confirmations INTEGER DEFAULT 3,
  
  admin_verified BOOLEAN DEFAULT false,
  admin_id UUID REFERENCES users(id),
  admin_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);

-- ============================================
-- WITHDRAWAL REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  destination_address VARCHAR(100) NOT NULL,
  transaction_hash VARCHAR(255),
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected', 'failed')),
  
  fee NUMERIC(20, 8) DEFAULT 0,
  net_amount NUMERIC(20, 8),
  
  admin_approved BOOLEAN DEFAULT false,
  admin_id UUID REFERENCES users(id),
  admin_notes TEXT,
  rejection_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);

-- ============================================
-- GOLD PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS gold_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gold_security_id UUID REFERENCES gold_securities(id),
  price_per_gram_usd NUMERIC(15, 8) NOT NULL,
  total_price_usd NUMERIC(15, 2) NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gold_price_history_security ON gold_price_history(gold_security_id);
CREATE INDEX IF NOT EXISTS idx_gold_price_history_date ON gold_price_history(created_at DESC);

-- ============================================
-- CRYPTO PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crypto_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  currency_symbol VARCHAR(10) NOT NULL,
  price_usd NUMERIC(20, 8) NOT NULL,
  source VARCHAR(50) DEFAULT 'noones_api',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crypto_price_history_symbol ON crypto_price_history(currency_symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_price_history_date ON crypto_price_history(created_at DESC);

-- ============================================
-- MERCHANT WALLET TABLE (Admin's holding wallet)
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_wallet (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  currency VARCHAR(10) UNIQUE NOT NULL,
  balance NUMERIC(20, 8) DEFAULT 0,
  wallet_address VARCHAR(100),
  total_deposited NUMERIC(20, 8) DEFAULT 0,
  total_withdrawn NUMERIC(20, 8) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert merchant wallets for supported currencies
INSERT INTO merchant_wallet (currency, balance, wallet_address) VALUES
  ('BTC', 0, 'ADMIN_BTC_ADDRESS_HERE'),
  ('USDT', 0, 'ADMIN_USDT_ADDRESS_HERE'),
  ('ETH', 0, 'ADMIN_ETH_ADDRESS_HERE')
ON CONFLICT (currency) DO NOTHING;

-- ============================================
-- PLATFORM SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('platform_fee_percentage', '0.5', 'Platform fee for transactions (percentage)'),
  ('min_withdrawal_btc', '0.001', 'Minimum BTC withdrawal amount'),
  ('min_withdrawal_usdt', '10', 'Minimum USDT withdrawal amount'),
  ('min_withdrawal_eth', '0.01', 'Minimum ETH withdrawal amount'),
  ('gold_sell_back_enabled', 'true', 'Allow users to sell gold back to platform'),
  ('auto_approve_deposits', 'false', 'Auto-approve deposits without admin review'),
  ('max_holding_period_days', '365', 'Maximum holding period for gold before mandatory action')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_gold_securities_updated_at ON gold_securities;
CREATE TRIGGER update_gold_securities_updated_at BEFORE UPDATE ON gold_securities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_gold_holdings_updated_at ON gold_holdings;
CREATE TRIGGER update_gold_holdings_updated_at BEFORE UPDATE ON gold_holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deposit_requests_updated_at ON deposit_requests;
CREATE TRIGGER update_deposit_requests_updated_at BEFORE UPDATE ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at ON withdrawal_requests;
CREATE TRIGGER update_withdrawal_requests_updated_at BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- User portfolio view
CREATE OR REPLACE VIEW user_portfolios AS
SELECT 
  u.id as user_id,
  u.full_name,
  u.email,
  COALESCE(w.btc_balance, 0) as btc_balance,
  COALESCE(w.usdt_balance, 0) as usdt_balance,
  COALESCE(w.eth_balance, 0) as eth_balance,
  COALESCE(
    (w.btc_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'BTC')) +
    (w.usdt_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'USDT')) +
    (w.eth_balance * (SELECT current_price_usd FROM crypto_currencies WHERE symbol = 'ETH')),
    0
  ) as total_crypto_value_usd,
  COALESCE(SUM(gh.current_value_usd) FILTER (WHERE gh.status = 'holding'), 0) as total_gold_value_usd,
  COALESCE(SUM(gh.profit_loss_usd) FILTER (WHERE gh.status = 'holding'), 0) as total_gold_profit_usd,
  COUNT(gh.id) FILTER (WHERE gh.status = 'holding') as active_skrs
FROM users u
LEFT JOIN wallets w ON u.id = w.user_id
LEFT JOIN gold_holdings gh ON u.id = gh.user_id
GROUP BY u.id, u.full_name, u.email, w.btc_balance, w.usdt_balance, w.eth_balance;

-- Transaction statistics view
CREATE OR REPLACE VIEW transaction_statistics AS
SELECT 
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_transactions,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_transactions,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions,
  COUNT(*) FILTER (WHERE type = 'deposit') as total_deposits,
  COUNT(*) FILTER (WHERE type = 'withdrawal') as total_withdrawals,
  COUNT(*) FILTER (WHERE type = 'gold_purchase') as total_gold_purchases,
  COUNT(*) FILTER (WHERE type = 'gold_sale') as total_gold_sales,
  SUM(total_fee) as total_fees_collected
FROM transactions;

-- Gold holdings statistics
CREATE OR REPLACE VIEW gold_statistics AS
SELECT 
  gs.id as security_id,
  gs.name,
  gs.price_per_gram_usd as current_price,
  COUNT(gh.id) FILTER (WHERE gh.status = 'holding') as active_holdings,
  SUM(gh.quantity) FILTER (WHERE gh.status = 'holding') as total_quantity_held,
  SUM(gh.total_paid_usd) FILTER (WHERE gh.status = 'holding') as total_value_locked,
  gs.available_quantity
FROM gold_securities gs
LEFT JOIN gold_holdings gh ON gs.id = gh.gold_security_id
GROUP BY gs.id, gs.name, gs.price_per_gram_usd, gs.available_quantity;

-- ============================================
-- FUNCTION: Calculate Gold Profit/Loss
-- ============================================
CREATE OR REPLACE FUNCTION calculate_gold_profit()
RETURNS TRIGGER AS $$
DECLARE
  current_price NUMERIC(15, 8);
  days_held INTEGER;
BEGIN
  -- Get current price for this gold security
  SELECT price_per_gram_usd INTO current_price
  FROM gold_securities
  WHERE id = NEW.gold_security_id;
  
  -- Calculate holding duration
  days_held := EXTRACT(DAY FROM (CURRENT_TIMESTAMP - NEW.purchase_date));
  
  -- Update current values
  NEW.current_price_per_gram := current_price;
  NEW.current_value_usd := current_price * NEW.weight_grams;
  NEW.profit_loss_usd := NEW.current_value_usd - NEW.total_paid_usd;
  NEW.profit_loss_percentage := ((NEW.current_value_usd - NEW.total_paid_usd) / NEW.total_paid_usd) * 100;
  NEW.holding_duration_days := days_held;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS calculate_gold_profit_trigger ON gold_holdings;
CREATE TRIGGER calculate_gold_profit_trigger
  BEFORE INSERT OR UPDATE ON gold_holdings
  FOR EACH ROW
  EXECUTE FUNCTION calculate_gold_profit();

-- ============================================
-- FUNCTION: Update Wallet Balance
-- ============================================
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    IF NEW.type = 'deposit' THEN
      -- Add to wallet
      UPDATE wallets 
      SET 
        btc_balance = CASE WHEN NEW.to_currency = 'BTC' THEN btc_balance + NEW.to_amount ELSE btc_balance END,
        usdt_balance = CASE WHEN NEW.to_currency = 'USDT' THEN usdt_balance + NEW.to_amount ELSE usdt_balance END,
        eth_balance = CASE WHEN NEW.to_currency = 'ETH' THEN eth_balance + NEW.to_amount ELSE eth_balance END
      WHERE user_id = NEW.user_id;
      
    ELSIF NEW.type = 'withdrawal' THEN
      -- Deduct from wallet
      UPDATE wallets 
      SET 
        btc_balance = CASE WHEN NEW.from_currency = 'BTC' THEN btc_balance - NEW.from_amount ELSE btc_balance END,
        usdt_balance = CASE WHEN NEW.from_currency = 'USDT' THEN usdt_balance - NEW.from_amount ELSE usdt_balance END,
        eth_balance = CASE WHEN NEW.from_currency = 'ETH' THEN eth_balance - NEW.from_amount ELSE eth_balance END
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS update_wallet_balance_trigger ON transactions;
CREATE TRIGGER update_wallet_balance_trigger
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_balance();

-- ============================================
-- ADMIN ACTIONS LOG
-- ============================================
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  description TEXT,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);


