# Database Initialization - Production Ready

This folder contains the production-ready database initialization files for the Track Platform.

## Production Files

### Main Initialization Script
- **`init-production-safe.js`** - Main production initialization script
- **`production-init-safe.sql`** - Complete production database schema (self-contained)
  - Includes all tables, indexes, triggers, views
  - Includes referrals, crowdfunding, AI trading, withdrawal requests
  - Uses `CREATE TABLE IF NOT EXISTS` (safe for existing databases)
  - Includes migrations for missing columns and constraints
  - Includes seed data (admin user, crypto currencies, gold products)

### Utility Scripts
- **`auto-init.js`** - Auto-initialization check (used by server.js)
- **`clear-test-data.js` / `clear-test-data.sql`** - Clear test data while preserving seed data

## Usage

### Initialize Database (First Time)
```bash
npm run db:init
```

This will:
- Create all tables if they don't exist
- Add missing columns and constraints
- Insert seed data (admin user, crypto currencies, gold products)
- Preserve existing data (safe for production)

### Check Database Status
```bash
npm run db:check
```

### Clear Test Data (Preserves Seed Data)
```bash
npm run db:clear
```

This will:
- Clear all transaction data
- Clear all test users (keeps admin)
- Clear all test wallets (keeps admin wallet)
- Preserve seed data (admin user, crypto currencies, gold products)

## Environment Variables

Set these in your `.env` file:

```env
# Database connection
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password

# Admin password (for initial admin user)
ADMIN_PASSWORD=your-secure-password

# Optional: Auto-initialize database on server start
AUTO_INIT_DB=false
```

## Admin Credentials

After initialization, default admin credentials:
- **Email:** `admin@uobsecurity.com`
- **Password:** Set by `ADMIN_PASSWORD` environment variable (default: `admin123`)

⚠️ **IMPORTANT:** Change the admin password after first login!

## Database Schema

The `production-init-safe.sql` file includes:
- Core entities (users, wallets, transactions)
- Crypto currencies (BTC, ETH, USDT)
- Gold securities (Gold Bar products)
- Referral system
- Withdrawal requests
- AI trading bots
- Crowdfunding contracts
- All indexes, triggers, and views

## Notes

- The initialization script is **idempotent** - safe to run multiple times
- It will **not** delete existing data
- It will add missing columns and constraints
- It will insert seed data only if it doesn't already exist

