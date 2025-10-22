-- Crowdfunding Contracts Table
CREATE TABLE IF NOT EXISTS crowdfunding_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_amount DECIMAL(20, 8) NOT NULL,
    current_amount DECIMAL(20, 8) DEFAULT 0,
    minimum_investment DECIMAL(20, 8) DEFAULT 100, -- Minimum $100
    maximum_investment DECIMAL(20, 8), -- Unlimited (NULL)
    currency VARCHAR(10) DEFAULT 'USDT',
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image_url VARCHAR(500),
    contract_type VARCHAR(20) DEFAULT 'gold' CHECK (contract_type IN ('gold', 'oil')),
    profit_percentage DECIMAL(5, 2) DEFAULT 1.00, -- 1% profit
    contract_duration_months INTEGER DEFAULT 12, -- 1 year contract
    is_target_reached BOOLEAN DEFAULT FALSE,
    profit_distributed BOOLEAN DEFAULT FALSE
);

-- Crowdfunding Investments Table
CREATE TABLE IF NOT EXISTS crowdfunding_investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES crowdfunding_contracts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- 'wallet_balance', 'direct_payment'
    transaction_hash VARCHAR(255), -- For blockchain transactions
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    admin_notes TEXT,
    -- Profit tracking
    profit_amount DECIMAL(20, 8) DEFAULT 0, -- Calculated profit
    profit_paid BOOLEAN DEFAULT FALSE, -- Whether profit has been paid
    profit_paid_date TIMESTAMP,
    profit_payment_hash VARCHAR(255) -- Transaction hash for profit payment
);

-- Crowdfunding Updates Table (for project updates)
CREATE TABLE IF NOT EXISTS crowdfunding_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES crowdfunding_contracts(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_public BOOLEAN DEFAULT true
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contracts_status ON crowdfunding_contracts(status);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_contracts_created_at ON crowdfunding_contracts(created_at);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_contract_id ON crowdfunding_investments(contract_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_user_id ON crowdfunding_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_crowdfunding_investments_status ON crowdfunding_investments(status);

-- Update trigger for crowdfunding_contracts
CREATE OR REPLACE FUNCTION update_crowdfunding_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crowdfunding_contracts_updated_at
    BEFORE UPDATE ON crowdfunding_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_crowdfunding_contracts_updated_at();

-- Update trigger for crowdfunding_investments
CREATE OR REPLACE FUNCTION update_crowdfunding_investments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crowdfunding_investments_updated_at
    BEFORE UPDATE ON crowdfunding_investments
    FOR EACH ROW
    EXECUTE FUNCTION update_crowdfunding_investments_updated_at();

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

CREATE TRIGGER update_contract_amount_trigger
    AFTER UPDATE ON crowdfunding_investments
    FOR EACH ROW
    EXECUTE FUNCTION update_contract_amount();

-- Function to check if contract target is reached and distribute profits
CREATE OR REPLACE FUNCTION check_and_distribute_profits()
RETURNS TRIGGER AS $$
DECLARE
    contract_record RECORD;
    investment_record RECORD;
    total_profit DECIMAL(20, 8);
BEGIN
    -- Get contract details
    SELECT * INTO contract_record 
    FROM crowdfunding_contracts 
    WHERE id = NEW.contract_id;
    
    -- Check if target is reached and not already processed
    IF contract_record.current_amount >= contract_record.target_amount 
       AND NOT contract_record.is_target_reached 
       AND contract_record.status = 'ongoing' THEN
        
        -- Mark target as reached
        UPDATE crowdfunding_contracts 
        SET is_target_reached = TRUE, status = 'completed'
        WHERE id = NEW.contract_id;
        
        -- Calculate and update profit for all confirmed investments
        FOR investment_record IN 
            SELECT * FROM crowdfunding_investments 
            WHERE contract_id = NEW.contract_id AND status = 'confirmed'
        LOOP
            total_profit := investment_record.amount * (contract_record.profit_percentage / 100);
            
            UPDATE crowdfunding_investments 
            SET profit_amount = total_profit
            WHERE id = investment_record.id;
        END LOOP;
        
        -- Mark profit as distributed
        UPDATE crowdfunding_contracts 
        SET profit_distributed = TRUE
        WHERE id = NEW.contract_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER check_profit_distribution_trigger
    AFTER UPDATE ON crowdfunding_contracts
    FOR EACH ROW
    EXECUTE FUNCTION check_and_distribute_profits();
