# 🧪 Testnet Testing Guide

## 🎯 Pool Wallet Addresses (Fund These for Testing)

### **BTC Testnet Address:**
```
1Ei9UmLQv4o4UJTy5r5mnGFeC9auM3W5P1
```

### **ETH/USDT Sepolia Testnet Address:**
```
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

## 🔧 Testnet Setup Instructions

### **1. Get Testnet Crypto**

#### **Bitcoin Testnet (BTC):**
- **Faucet:** https://coinfaucet.eu/en/btc-testnet/
- **Alternative:** https://testnet-faucet.mempool.co/
- Send BTC to: `1Ei9UmLQv4o4UJTy5r5mnGFeC9auM3W5P1`

#### **Ethereum Sepolia (ETH):**
- **Faucet:** https://sepoliafaucet.com/
- **Alternative:** https://faucet.sepolia.dev/
- Send ETH to: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

#### **USDT Sepolia (Test Token):**
- **Faucet:** https://sepoliafaucet.com/ (if available)
- **Contract:** Use the same ETH address for USDT
- Send USDT to: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

### **2. MetaMask Setup**

1. **Switch to Sepolia Testnet:**
   - Open MetaMask
   - Click network dropdown
   - Select "Sepolia test network"
   - If not visible, add custom network:
     - Network Name: `Sepolia Testnet`
     - RPC URL: `https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161`
     - Chain ID: `11155111`
     - Currency Symbol: `ETH`
     - Block Explorer: `https://sepolia.etherscan.io`

2. **Get Test ETH:**
   - Use Sepolia faucets to get test ETH
   - You need ETH for gas fees

## 🧪 Testing Scenarios

### **Scenario 1: User Registration & Wallet Creation**
1. **Register new user** on the platform
2. **Login** and go to Wallet page
3. **Verify** deposit addresses are generated
4. **Check** that addresses are unique for each user

### **Scenario 2: Deposit Flow (User Perspective)**
1. **Get user deposit address** from Wallet page
2. **Send test crypto** from MetaMask to user address
3. **Verify** deposit appears in user's balance
4. **Check** transaction history

### **Scenario 3: Admin Pool Management**
1. **Login as admin** (`admin@uobsecurity.com` / `admin123`)
2. **Go to Admin panel**
3. **Check pool wallet balances**
4. **Monitor incoming deposits**

### **Scenario 4: Withdrawal Flow**
1. **User requests withdrawal** from Wallet page
2. **Admin sees pending withdrawal** in admin panel
3. **Admin approves withdrawal**
4. **Verify crypto sent** to user's MetaMask address

### **Scenario 5: Gold Exchange**
1. **User deposits crypto** (BTC/ETH/USDT)
2. **Go to Exchange page**
3. **Buy gold** with deposited crypto
4. **Check gold holdings** on Dashboard

## 🔍 Monitoring & Debugging

### **Backend Logs:**
```bash
# Watch backend logs for blockchain monitoring
cd backend
node server.js
```

### **Key Log Messages:**
- `🚀 Starting pool wallet blockchain monitoring...`
- `💰 New BTC deposit detected...`
- `💰 New ETH deposit detected...`
- `📤 Sending BTC from pool to...`

### **Database Queries:**
```sql
-- Check deposit requests
SELECT * FROM deposit_requests ORDER BY created_at DESC LIMIT 10;

-- Check withdrawal requests
SELECT * FROM withdrawal_requests ORDER BY created_at DESC LIMIT 10;

-- Check user wallets
SELECT * FROM wallets ORDER BY created_at DESC LIMIT 5;
```

## 🚨 Common Issues & Solutions

### **Issue 1: "No deposits detected"**
- **Cause:** Blockchain monitoring not working
- **Solution:** Check ETH_RPC_URL in .env file
- **Fix:** Use working Sepolia RPC endpoint

### **Issue 2: "Transaction failed"**
- **Cause:** Insufficient gas or invalid address
- **Solution:** Check MetaMask network (must be Sepolia)
- **Fix:** Increase gas limit or verify address

### **Issue 3: "Pool wallet has no funds"**
- **Cause:** Pool wallet not funded
- **Solution:** Send test crypto to pool addresses
- **Fix:** Use testnet faucets to fund pool

### **Issue 4: "Withdrawal not processed"**
- **Cause:** Admin approval required
- **Solution:** Login as admin and approve withdrawal
- **Fix:** Check admin panel for pending withdrawals

## 📊 Expected Test Results

### **✅ Successful Test Indicators:**
1. **User deposits** appear in balance within 1-2 minutes
2. **Pool wallet** receives and forwards deposits
3. **Admin can approve** withdrawals
4. **Crypto appears** in user's MetaMask
5. **Gold exchange** works with real-time prices
6. **Transaction history** is accurate

### **❌ Failure Indicators:**
1. **Deposits not detected** after 5+ minutes
2. **Error messages** in backend logs
3. **Failed transactions** in MetaMask
4. **Missing balances** after deposits
5. **Admin approval** not working

## 🎯 Next Steps After Testing

1. **Verify all flows work** on testnet
2. **Test edge cases** (insufficient funds, invalid addresses)
3. **Check admin controls** (approve/reject withdrawals)
4. **Test gold exchange** with different amounts
5. **Verify security** (private keys encrypted, proper access control)

## 🔐 Security Notes

- **Private keys are encrypted** in memory
- **Admin never sees plain text** private keys
- **All transactions logged** in audit trail
- **Testnet only** - no real funds at risk
- **Production deployment** requires secure key management

---

**Ready to test! Start with funding the pool wallet addresses and then test the user flow.** 🚀
