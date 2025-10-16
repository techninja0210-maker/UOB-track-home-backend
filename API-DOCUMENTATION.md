# 📚 API Documentation - Track Platform

## 🌐 Base URL

**Development:** `http://localhost:5000`  
**Production:** `https://uob-track-home-backend.onrender.com`

---

## 🔐 Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📋 API Endpoints

### **Authentication (`/api/auth`)**

#### `POST /api/auth/signup`
Register new user

**Request:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": "uuid",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

#### `POST /api/auth/login`
User login

**Request:**
```json
{
  "email": "john@example.com",
  "password": "password123",
  "keepSignedIn": false
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

#### `GET /api/auth/verify` 🔐
Verify JWT token

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

### **Wallet Management (`/api/wallet`)** 🔐

#### `GET /api/wallet`
Get user's wallet with current balances and values

**Response:**
```json
{
  "btcBalance": 0.05,
  "usdtBalance": 1000.50,
  "ethBalance": 0.25,
  "btcValueUsd": 3000.00,
  "usdtValueUsd": 1000.50,
  "ethValueUsd": 750.00,
  "totalValueUsd": 4750.50,
  "btcAddress": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "usdtAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "ethAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

#### `GET /api/wallet/transactions`
Get wallet transaction history

**Query Parameters:**
- `type`: deposit | withdrawal | gold_purchase | gold_sale
- `status`: pending | completed | failed
- `limit`: number (default: 50)

**Response:**
```json
[
  {
    "id": "uuid",
    "type": "gold_purchase",
    "fromCurrency": "USDT",
    "toCurrency": "GOLD",
    "fromAmount": 500.00,
    "toAmount": 10.0,
    "goldName": "10g Gold Bar",
    "skrReference": "SKR1234567890",
    "exchangeRate": 50.00,
    "fee": 2.50,
    "status": "completed",
    "createdAt": "2024-10-09T...",
    "completedAt": "2024-10-09T..."
  }
]
```

#### `POST /api/wallet/deposit`
Request crypto deposit

**Request:**
```json
{
  "currency": "USDT",
  "amount": 1000,
  "walletAddress": "0x742d35Cc...",
  "transactionHash": "0xabc123..."
}
```

**Response:**
```json
{
  "message": "Deposit request submitted. Awaiting admin verification.",
  "depositId": "uuid",
  "status": "pending"
}
```

#### `POST /api/wallet/withdrawal`
Request crypto withdrawal

**Request:**
```json
{
  "currency": "USDT",
  "amount": 500,
  "destinationAddress": "0x742d35Cc..."
}
```

**Response:**
```json
{
  "message": "Withdrawal request submitted. Awaiting admin approval.",
  "withdrawalId": "uuid",
  "fee": 2.50,
  "netAmount": 497.50,
  "status": "pending"
}
```

#### `GET /api/wallet/deposits`
Get user's deposit history

#### `GET /api/wallet/withdrawals`
Get user's withdrawal history

---

### **Gold Securities (`/api/securities`)** 🔐

#### `GET /api/securities`
Get all available gold products

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "1oz Gold Bar",
    "weightGrams": 31.10,
    "purity": "999.9",
    "pricePerGram": 65.00,
    "totalPrice": 2021.50,
    "availableQuantity": 100,
    "description": "Standard 1 troy ounce gold bar",
    "imageUrl": null,
    "isActive": true
  }
]
```

#### `GET /api/securities/:id`
Get gold security details

#### `POST /api/securities/purchase`
Purchase gold with crypto

**Request:**
```json
{
  "goldSecurityId": "uuid",
  "quantity": 2,
  "paymentCurrency": "USDT"
}
```

**Response:**
```json
{
  "message": "Gold purchase successful!",
  "skrReference": "SKR1234567890",
  "quantity": 2,
  "weightGrams": 62.20,
  "totalPaid": 4043.00,
  "paymentCurrency": "USDT",
  "paymentAmount": 4043.00
}
```

---

### **SKR Management (`/api/skrs`)** 🔐

#### `GET /api/skrs`
Get all user's SKRs (Safe Keeping Receipts)

**Query Parameters:**
- `status`: holding | sold | withdrawn

**Response:**
```json
[
  {
    "id": "uuid",
    "skrReference": "SKR1234567890",
    "goldName": "1oz Gold Bar",
    "purity": "999.9",
    "quantity": 2,
    "weightGrams": 62.20,
    "purchasePricePerGram": 65.00,
    "totalPaid": 4043.00,
    "currentPricePerGram": 67.50,
    "currentValue": 4198.50,
    "profitLoss": 155.50,
    "profitLossPercentage": 3.85,
    "paymentCurrency": "USDT",
    "paymentAmount": 4043.00,
    "status": "holding",
    "purchaseDate": "2024-10-09T...",
    "holdingDays": 15
  }
]
```

#### `GET /api/skrs/:skrReference`
Get SKR details with profit calculation

**Response:**
```json
{
  "skrReference": "SKR1234567890",
  "goldName": "1oz Gold Bar",
  "purity": "999.9",
  "quantity": 2,
  "weightGrams": 62.20,
  "purchaseDetails": {
    "pricePerGram": 65.00,
    "totalPaid": 4043.00,
    "paymentCurrency": "USDT",
    "paymentAmount": 4043.00,
    "purchaseDate": "2024-10-09T..."
  },
  "currentDetails": {
    "pricePerGram": 67.50,
    "currentValue": 4198.50,
    "marketPrice": 67.50
  },
  "profitLoss": {
    "amount": 155.50,
    "percentage": 3.85,
    "daysHeld": 15
  },
  "status": "holding"
}
```

#### `POST /api/skrs/:id/sell`
Sell gold back to platform

**Response:**
```json
{
  "message": "Gold sold successfully!",
  "soldPrice": 4198.50,
  "profitLoss": 155.50,
  "skrReference": "SKR1234567890",
  "creditedToWallet": true
}
```

#### `POST /api/skrs/:id/withdraw-profit`
Withdraw only the profit (keep principal in gold)

**Response:**
```json
{
  "message": "Profit withdrawn successfully!",
  "profitWithdrawn": 155.50,
  "skrReference": "SKR1234567890",
  "creditedToWallet": true
}
```

---

### **Prices (`/api/prices`)** 🌐 Public

#### `GET /api/prices/crypto`
Get current crypto prices

**Response:**
```json
{
  "BTC": 60250.50,
  "ETH": 3050.75,
  "USDT": 1.00,
  "cached": false,
  "lastUpdate": "2024-10-09T..."
}
```

#### `GET /api/prices/crypto/history/:symbol`
Get crypto price history

**Query Parameters:**
- `limit`: number (default: 24)

**Example:** `/api/prices/crypto/history/BTC?limit=24`

#### `GET /api/prices/exchange-rate`
Calculate exchange rate

**Query Parameters:**
- `from`: BTC | ETH | USDT
- `to`: BTC | ETH | USDT
- `amount`: number

**Example:** `/api/prices/exchange-rate?from=BTC&to=USDT&amount=0.5`

**Response:**
```json
{
  "from": "BTC",
  "to": "USDT",
  "rate": 60250.50,
  "inputAmount": 0.5,
  "outputAmount": 30125.25,
  "timestamp": "2024-10-09T..."
}
```

---

### **Admin - Crypto Management (`/api/admin/crypto`)** 🔐👑

#### `GET /api/admin/crypto/securities`
Get all gold securities with statistics

#### `PUT /api/admin/crypto/securities/:id/price`
Update gold price

**Request:**
```json
{
  "pricePerGram": 68.00,
  "reason": "Market rate increase"
}
```

#### `GET /api/admin/crypto/wallets`
Get all user wallets overview

#### `GET /api/admin/crypto/deposits`
Get all deposit requests

**Query Parameters:**
- `status`: pending | completed | failed

#### `POST /api/admin/crypto/deposits/:id/approve`
Approve deposit request

**Request:**
```json
{
  "transactionHash": "0xabc123..."
}
```

#### `GET /api/admin/crypto/withdrawals`
Get all withdrawal requests

#### `POST /api/admin/crypto/withdrawals/:id/approve`
Approve withdrawal request

**Request:**
```json
{
  "transactionHash": "0xabc123..."
}
```

#### `POST /api/admin/crypto/withdrawals/:id/reject`
Reject withdrawal request

**Request:**
```json
{
  "reason": "Suspicious activity"
}
```

#### `GET /api/admin/crypto/transactions`
Get all platform transactions

#### `GET /api/admin/crypto/statistics`
Get platform statistics

**Response:**
```json
{
  "transactions": {
    "total_transactions": 150,
    "completed_transactions": 140,
    "pending_transactions": 10,
    "total_deposits": 50,
    "total_withdrawals": 30,
    "total_gold_purchases": 60,
    "total_gold_sales": 10,
    "total_fees_collected": 125.50
  },
  "gold": [...],
  "platformValue": {
    "totalCryptoLocked": 50000.00
  }
}
```

#### `GET /api/admin/crypto/settings`
Get platform settings

#### `PUT /api/admin/crypto/settings/:key`
Update platform setting

**Request:**
```json
{
  "value": "1.0"
}
```

---

## 🔑 Authorization Levels

| Endpoint | Public | User 🔐 | Admin 👑 |
|----------|--------|---------|----------|
| `/api/auth/*` | ✅ | ✅ | ✅ |
| `/api/receipts/*` | ✅ | ✅ | ✅ |
| `/api/prices/*` | ✅ | ✅ | ✅ |
| `/api/wallet/*` | ❌ | ✅ | ✅ |
| `/api/securities/*` | ❌ | ✅ | ✅ |
| `/api/skrs/*` | ❌ | ✅ | ✅ |
| `/api/admin/*` | ❌ | ❌ | ✅ |
| `/api/admin/crypto/*` | ❌ | ❌ | ✅ |

---

## 📊 Data Models

### **User**
```typescript
{
  id: UUID,
  fullName: string,
  email: string,
  role: 'user' | 'admin',
  createdAt: Date,
  lastLogin: Date
}
```

### **Wallet**
```typescript
{
  btcBalance: number,      // Bitcoin balance
  usdtBalance: number,     // USDT balance
  ethBalance: number,      // Ethereum balance
  totalValueUsd: number    // Total portfolio value
}
```

### **Gold Security**
```typescript
{
  id: UUID,
  name: string,
  weightGrams: number,
  purity: string,
  pricePerGram: number,
  totalPrice: number,
  availableQuantity: number,
  description: string
}
```

### **Gold Holding (SKR)**
```typescript
{
  skrReference: string,    // Unique SKR number
  goldName: string,
  quantity: number,
  weightGrams: number,
  purchasePricePerGram: number,
  totalPaid: number,
  currentValue: number,
  profitLoss: number,
  profitLossPercentage: number,
  status: 'holding' | 'sold' | 'withdrawn',
  purchaseDate: Date,
  holdingDays: number
}
```

### **Transaction**
```typescript
{
  id: UUID,
  type: 'deposit' | 'withdrawal' | 'gold_purchase' | 'gold_sale',
  fromCurrency: string,
  toCurrency: string,
  fromAmount: number,
  toAmount: number,
  skrReference?: string,
  exchangeRate: number,
  fee: number,
  status: 'pending' | 'completed' | 'failed',
  createdAt: Date,
  completedAt?: Date
}
```

---

## 🚀 Quick Start Examples

### **1. Register & Login**
```javascript
// Register
const signup = await fetch('/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'John Doe',
    email: 'john@example.com',
    password: 'password123'
  })
});

// Login
const login = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
  })
});
const { token } = await login.json();
```

### **2. Get Wallet Balance**
```javascript
const wallet = await fetch('/api/wallet', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const balance = await wallet.json();
console.log('Total Value:', balance.totalValueUsd);
```

### **3. Purchase Gold**
```javascript
const purchase = await fetch('/api/securities/purchase', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    goldSecurityId: 'uuid-of-gold-product',
    quantity: 2,
    paymentCurrency: 'USDT'
  })
});
const result = await purchase.json();
console.log('SKR Reference:', result.skrReference);
```

### **4. View SKRs**
```javascript
const skrs = await fetch('/api/skrs', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const holdings = await skrs.json();
holdings.forEach(skr => {
  console.log(`${skr.skrReference}: ${skr.profitLoss} profit`);
});
```

---

## 💰 Platform Fee Structure

- **Gold Purchase:** 0% (price included)
- **Gold Sale:** 0% (sell at current market price)
- **Withdrawals:** 0.5% platform fee
- **Deposits:** Free

---

## 🔒 Security

- All endpoints use HTTPS in production
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens expire in 24 hours (or 30 days with "keep signed in")
- SQL injection protected (parameterized queries)
- CORS configured for allowed origins only

---

## ⚠️ Error Responses

All errors follow this format:
```json
{
  "message": "Error description"
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate email, etc.)
- `500` - Internal Server Error

---

**Full platform ready for crypto-to-gold trading!** 🚀


