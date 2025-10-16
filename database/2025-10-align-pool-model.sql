-- Align schema with pool-wallet custodial model
-- 1) Keep only user balances and display addresses; remove per-user private keys
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='wallets' AND column_name='btc_private_key_encrypted'
  ) THEN
    ALTER TABLE wallets DROP COLUMN btc_private_key_encrypted;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='wallets' AND column_name='eth_private_key_encrypted'
  ) THEN
    ALTER TABLE wallets DROP COLUMN eth_private_key_encrypted;
  END IF;
END $$;

-- 2) Ensure address columns exist for display-only unique addresses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='wallets' AND column_name='btc_address'
  ) THEN
    ALTER TABLE wallets ADD COLUMN btc_address VARCHAR(255);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='wallets' AND column_name='eth_address'
  ) THEN
    ALTER TABLE wallets ADD COLUMN eth_address VARCHAR(255);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='wallets' AND column_name='usdt_address'
  ) THEN
    ALTER TABLE wallets ADD COLUMN usdt_address VARCHAR(255);
  END IF;
END $$;

-- 3) Deposit/withdrawal requests should allow pending/confirming/completed states
ALTER TABLE deposit_requests 
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE withdrawal_requests 
  ALTER COLUMN status SET DEFAULT 'pending';

-- 4) Optional cleanup of no-longer-used tables for pool model
-- Drop merchant_wallet and crypto_currencies if they exist and are unused
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='merchant_wallet') THEN
    DROP TABLE merchant_wallet;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='crypto_currencies') THEN
    DROP TABLE crypto_currencies;
  END IF;
END $$;


