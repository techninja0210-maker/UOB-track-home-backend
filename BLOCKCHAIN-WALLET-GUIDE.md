# 🔐 Blockchain Wallet System - Complete Guide

## 📋 Overview

This is a **production-ready custodial wallet system** that integrates real blockchain functionality for Bitcoin (BTC), Ethereum (ETH), and USDT (ERC-20) deposits and withdrawals.

---

## 🏗️ Architecture

### **System Type: Custodial Wallet**

```
┌─────────────────────────────────────────────────────────────┐
│                    USER WORKFLOW                             │
├─────────────────────────────────────────────────────────────┤
│  1. User signs up                                           │
│     → Platform generates unique deposit addresses           │
│                                                              │
│  2. User sends crypto from external wallet                  │
│     → Platform's blockchain monitor detects deposit         │
│                                                              │
│  3. After confirmations, balance is credited                │
│     → User can trade crypto for gold (internal/database)   │
│                                                              │
│  4. User requests withdrawal                                │
│     → Admin approves → Platform sends crypto to user        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Setup Instructions

### **1. Run Database Setup**

```bash
cd backend
node setup-blockchain-wallet.js
```

This will:
- ✅ Add wallet address columns
- ✅ Create deposit/withdrawal tables
- ✅ Set up blockchain monitoring tables
- ✅ Add master wallet table

### **2. Generate Secure Credentials**

#### **A. Generate BIP39 Mnemonic (Master Seed)**

Visit: https://iancoleman.io/bip39/

1. Set "Mnemonic Length" to **24 words** (256 bits)
2. Click "Generate"
3. Copy the mnemonic phrase
4. **KEEP IT SECURE - Never share or commit to git**

Example:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

#### **B. Generate Encryption Key**

Use Node.js to generate a secure key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Example output:
```
K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

#### **C. Get Ethereum RPC URL**

**Option 1: Infura (Recommended)**
1. Go to https://infura.io
2. Sign up for free
3. Create a new project
4. Copy the Mainnet endpoint:
   ```
   https://mainnet.infura.io/v3/YOUR_PROJECT_ID
   ```

**Option 2: Alchemy**
1. Go to https://www.alchemy.com
2. Sign up for free
3. Create app on Ethereum Mainnet
4. Copy the HTTPS URL

### **3. Update .env File**

```env
# Critical: Add these to your .env file

WALLET_ENCRYPTION_KEY=K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=

MASTER_WALLET_SEED=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
```

⚠️ **SECURITY WARNING:**
- Never commit `.env` to git
- Store these securely (password manager, vault)
- Losing these means losing access to wallets!

---

## 🚀 How It Works

### **1. Wallet Address Generation**

When a user signs up, the system:

```javascript
// Deterministic HD Wallet Generation
1. Uses MASTER_WALLET_SEED as root
2. Derives unique path for each user: m/44'/0'/userId'/0/0
3. Generates:
   - BTC address (P2PKH format)
   - ETH address (same for USDT - ERC-20)
4. Encrypts private keys
5. Stores in database
```

**Example:**
```
User ID: abc123
BTC Path: m/44'/0'/12345'/0/0
BTC Address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
ETH Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

### **2. Deposit Detection**

**Bitcoin:**
```javascript
// Every 2 minutes
1. Query Blockstream API for each user's BTC address
2. Check for new transactions
3. Wait for 6 confirmations
4. Credit user balance
```

**Ethereum & USDT:**
```javascript
// Every 1 minute
1. Connect to Ethereum via Infura/Alchemy
2. Check ETH balance for each address
3. Check USDT balance (ERC-20 contract)
4. Wait for 12 confirmations
5. Credit user balance
```

### **3. Internal Trading**

All crypto ↔ gold exchanges happen **in the database** (no blockchain):

```javascript
// User buys 100g of gold with 0.01 BTC
1. Deduct 0.01 BTC from balance
2. Create SKR (Safe Keeping Receipt)
3. Update database
// Fast, no fees, instant
```

### **4. Withdrawal Process**

```javascript
// User-initiated withdrawal
1. User requests withdrawal (amount + destination address)
2. System validates balance and address
3. Amount is frozen (deducted from balance)
4. Admin receives notification
5. Admin approves/rejects
6. If approved: Platform sends crypto from master wallet
7. Transaction hash recorded
8. Withdrawal marked as completed
```

---

## 📡 API Endpoints

### **User Endpoints**

#### **Get Deposit Address**
```http
GET /api/wallet/deposit-address/:currency
Authorization: Bearer <token>
```

Response:
```json
{
  "currency": "BTC",
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "qrCode": "data:image/png;base64,...",
  "message": "Send BTC to this address..."
}
```

#### **Request Withdrawal**
```http
POST /api/wallet/withdrawal
Authorization: Bearer <token>
Content-Type: application/json

{
  "currency": "BTC",
  "amount": 0.01,
  "destinationAddress": "1BitcoinEaterAddressDontSendF59kuE"
}
```

Response:
```json
{
  "success": true,
  "withdrawalId": "uuid",
  "amount": 0.01,
  "fee": 0.00005,
  "netAmount": 0.00995,
  "status": "pending",
  "message": "Withdrawal request submitted..."
}
```

#### **Get Deposit History**
```http
GET /api/wallet/deposits
Authorization: Bearer <token>
```

#### **Get Withdrawal History**
```http
GET /api/wallet/withdrawals
Authorization: Bearer <token>
```

### **Admin Endpoints**

#### **Get Pending Withdrawals**
```http
GET /api/admin/withdrawals/pending
Authorization: Bearer <admin-token>
```

#### **Approve Withdrawal**
```http
POST /api/admin/withdrawals/:id/approve
Authorization: Bearer <admin-token>
```

#### **Reject Withdrawal**
```http
POST /api/admin/withdrawals/:id/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "Insufficient platform balance"
}
```

---

## 🔒 Security Features

### **1. Private Key Encryption**

All private keys are encrypted using AES-256-CBC:

```javascript
// Encryption
- Algorithm: AES-256-CBC
- Key: WALLET_ENCRYPTION_KEY (32 bytes)
- IV: Random 16 bytes per encryption
- Storage: Format "iv:encryptedData"
```

### **2. Deterministic Wallets (HD Wallets)**

```javascript
// BIP32/BIP44 Standard
- One master seed generates all wallets
- User-specific derivation paths
- Can regenerate addresses if needed
- Backup = just the master seed
```

### **3. Database Security**

```sql
-- Private keys never exposed
-- Addresses indexed for fast lookup
-- Audit trail for all transactions
-- Status tracking for deposits/withdrawals
```

### **4. Withdrawal Approval**

```javascript
// Two-step withdrawal
1. User requests (amount frozen)
2. Admin approves (crypto sent)
// Prevents unauthorized withdrawals
```

---

## 🛠️ Maintenance & Operations

### **Monitor Blockchain Sync**

Check logs for:
```
🔍 Checking Bitcoin deposits...
✅ Bitcoin monitoring complete
🔍 Checking Ethereum/USDT deposits...
✅ Ethereum monitoring complete
```

### **Check Deposit Status**

```sql
-- View pending deposits
SELECT * FROM deposit_requests WHERE status = 'confirming';

-- View completed deposits
SELECT * FROM deposit_requests WHERE status = 'completed';
```

### **Check Withdrawal Queue**

```sql
-- Pending withdrawals
SELECT * FROM withdrawal_requests WHERE status = 'pending';

-- Failed withdrawals
SELECT * FROM withdrawal_requests WHERE status = 'failed';
```

### **Master Wallet Balance**

```sql
-- Check platform's crypto holdings
SELECT * FROM master_wallet;
```

---

## 🚨 Troubleshooting

### **Deposits Not Detected**

1. Check Ethereum RPC URL is configured
2. Verify API rate limits (Infura/Alchemy)
3. Check blockchain monitor logs
4. Verify user address is correct

### **Withdrawals Failing**

1. Check master wallet has sufficient balance
2. Verify private keys are correctly encrypted
3. Check Ethereum gas fees
4. Review error logs in withdrawal_requests table

### **Address Generation Issues**

1. Verify MASTER_WALLET_SEED is set
2. Check WALLET_ENCRYPTION_KEY is configured
3. Ensure bitcoinjs-lib and ethers are installed
4. Review wallet creation logs

---

## 📊 Database Schema

### **wallets** (Updated)
```sql
- btc_address VARCHAR(100)
- eth_address VARCHAR(100)
- usdt_address VARCHAR(100)  -- Same as ETH
- btc_private_key_encrypted TEXT
- eth_private_key_encrypted TEXT
```

### **deposit_requests** (New)
```sql
- transaction_hash
- confirmations
- status: pending/confirming/completed/failed
- detected_at
- confirmed_at
- credited_at
```

### **withdrawal_requests** (New)
```sql
- destination_address
- fee
- net_amount
- status: pending/approved/processing/completed/failed/rejected
- approved_by
- transaction_hash
```

### **master_wallet** (New)
```sql
- currency: BTC/ETH/USDT
- address
- private_key_encrypted
- balance
```

---

## 🎯 Testing

### **Test Deposit Flow**

1. Get your deposit address: `GET /api/wallet/deposit-address/BTC`
2. Send small amount from external wallet
3. Monitor database: `SELECT * FROM deposit_requests WHERE user_id = 'your-id'`
4. Check balance after confirmations

### **Test Withdrawal Flow**

1. Request withdrawal: `POST /api/wallet/withdrawal`
2. Admin approves: `POST /api/admin/withdrawals/:id/approve`
3. Check transaction hash
4. Verify crypto arrived at destination

---

## 📚 Resources

- **Bitcoin Blockchain Explorer:** https://blockstream.info
- **Ethereum Blockchain Explorer:** https://etherscan.io
- **BIP39 Mnemonic Generator:** https://iancoleman.io/bip39/
- **Infura Ethereum RPC:** https://infura.io
- **Alchemy Ethereum RPC:** https://alchemy.com
- **HD Wallet Standard (BIP32/BIP44):** https://github.com/bitcoin/bips

---

## ⚠️ Important Notes

1. **This is a custodial system** - Platform controls private keys
2. **Master wallet** holds actual crypto for withdrawals
3. **Regular backups** of database and master seed required
4. **Monitor master wallet balance** to ensure withdrawal liquidity
5. **Test on testnet first** before mainnet deployment
6. **Implement rate limiting** for API endpoints
7. **Set up monitoring alerts** for failed deposits/withdrawals
8. **Regular security audits** recommended

---

## 🚀 Production Checklist

Before going live:

- [ ] Generate secure MASTER_WALLET_SEED (24 words)
- [ ] Generate secure WALLET_ENCRYPTION_KEY (32 bytes)
- [ ] Configure Ethereum RPC (Infura/Alchemy)
- [ ] Fund master wallet with crypto for withdrawals
- [ ] Test deposits on testnet
- [ ] Test withdrawals on testnet
- [ ] Set up monitoring and alerts
- [ ] Enable SSL/TLS
- [ ] Implement rate limiting
- [ ] Set up backup system
- [ ] Document recovery procedures
- [ ] Conduct security audit

---

**🎉 Your blockchain wallet system is now ready for production!**

For questions or issues, review the logs and check the troubleshooting section.

