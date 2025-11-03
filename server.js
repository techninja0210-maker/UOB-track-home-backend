require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { pool } = require('./config/database');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Security middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const { generalLimiter } = require('./middleware/rateLimiter');
app.use('/api/', generalLimiter);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error (non-fatal, continuing):', err);
    // Do not exit; allow server to run and endpoints to return 5xx instead of crashing
  } else {
    console.log('✅ PostgreSQL database connected successfully');
    console.log('📊 Database time:', res.rows[0].now);
    
    // Crowdfunding tables are initialized via final-init.sql
    console.log('✅ Crowdfunding tables initialized via database schema');
    
    // Create withdrawal_requests table if it doesn't exist
    createWithdrawalTable();
  }
});

// Initialize pool wallets
const poolWalletService = require('./services/poolWalletService');
let poolWalletsReady = false;
poolWalletService.initializePoolWallets().then(() => {
  poolWalletsReady = true;
}).catch(err => {
  console.error('❌ Pool wallet initialization error:', err);
  // Don't exit - server can still run without pool wallets
});

// Authentication middleware
const authRoutes = require('./routes/auth');

// Start crypto price updates
const cryptoPriceService = require('./services/cryptoPriceService');
cryptoPriceService.startPriceUpdates(60000); // Update every minute

// Start market data collection for AI trading
// const marketDataService = require('./services/marketDataService');
// marketDataService.startDataCollection(['BTCUSDT', 'ETHUSDT'], '1h');

// Initialize AI trading bot engine
const botEngineService = require('./services/botEngineService');
botEngineService.initializeBotEngine();

// Start pool wallet blockchain monitoring
const poolBlockchainMonitor = require('./services/poolBlockchainMonitor');
// Start monitoring after a 10-second delay (allow server to fully initialize)
setTimeout(() => {
  if (!poolWalletsReady) {
    console.warn('⏸️ Skipping blockchain monitoring start: pool wallets not initialized');
    return;
  }
  poolBlockchainMonitor.startMonitoring().catch(err => {
    console.error('Blockchain monitor error (non-fatal):', err);
  });
}, 10000);

// Initialize WebSocket notifications
const notificationService = require('./services/notificationService');
notificationService.initialize(io);

// Initialize real-time gold price service (PRIMARY - uses free APIs or Metals.dev with API key)
const realtimeGoldPriceService = require('./services/realtimeGoldPriceService');
realtimeGoldPriceService.initialize(io);
realtimeGoldPriceService.start(); // Start broadcasting gold prices in real-time

// Note: TradingView/exchangerate-api.com doesn't support XAU (gold) on free tier
// Using real-time service as primary source instead

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/prices', require('./routes/prices')); // Crypto & gold prices
app.use('/api/password-reset', require('./routes/password-reset'));

// Protected user routes (authentication required)
app.use('/api/wallet', authRoutes.authenticateToken, require('./routes/wallet'));
app.use('/api/securities', authRoutes.authenticateToken, require('./routes/securities'));
app.use('/api/exchange', authRoutes.authenticateToken, require('./routes/exchange'));
app.use('/api/gold-exchange', authRoutes.authenticateToken, require('./routes/gold-exchange'));
app.use('/api/skrs', authRoutes.authenticateToken, require('./routes/skrs'));
app.use('/api/exports', authRoutes.authenticateToken, require('./routes/exports'));
app.use('/api/crowdfunding', require('./routes/crowdfunding'));
app.use('/api/withdrawals', require('./routes/withdrawals'));
app.use('/api/user', require('./routes/account-settings'));
app.use('/api/admin', require('./routes/account-settings'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/ai-trading', authRoutes.authenticateToken, require('./routes/aiTrading'));

// Protected admin routes (authentication + admin role required)
app.use('/api/admin', authRoutes.authenticateToken, authRoutes.requireAdmin, require('./routes/admin'));
app.use('/api/admin/crypto', authRoutes.authenticateToken, authRoutes.requireAdmin, require('./routes/admin-crypto'));
app.use('/api/admin/withdrawals', authRoutes.authenticateToken, authRoutes.requireAdmin, require('./routes/admin-withdrawals'));
app.use('/api/admin/pool', authRoutes.authenticateToken, authRoutes.requireAdmin, require('./routes/admin-pool'));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      dbTime: dbCheck.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message
    });
  }
});

// Database info endpoint
app.get('/api/db-info', authRoutes.authenticateToken, authRoutes.requireAdmin, async (req, res) => {
  try {
    const receiptsCount = await pool.query('SELECT COUNT(*) FROM receipts');
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({
      database: 'PostgreSQL',
      receipts: parseInt(receiptsCount.rows[0].count),
      users: parseInt(usersCount.rows[0].count),
      status: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  try {
    await pool.end();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 SIGTERM received, shutting down gracefully...');
  try {
    await pool.end();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server: ws://localhost:${PORT}`);
  console.log(`🔑 Default admin credentials: admin@uobsecurity.com / admin123`);
  console.log(`🌐 CORS enabled for: ${process.env.ALLOWED_ORIGINS || 'http://localhost:3000'}`);
  console.log(`💾 Database: PostgreSQL`);
  console.log(`🛡️ Rate limiting: Enabled`);
  console.log(`📧 Email notifications: ${process.env.SMTP_HOST ? 'Enabled' : 'Using Ethereal (test mode)'}`);
});

// Function to create withdrawal_requests table
async function createWithdrawalTable() {
  try {
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'withdrawal_requests'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Creating withdrawal_requests table...');
      const fs = require('fs');
      const sql = fs.readFileSync('./database/add-withdrawal-requests.sql', 'utf8');
      await pool.query(sql);
      console.log('✅ Withdrawal requests table created successfully!');
    } else {
      console.log('✅ Withdrawal requests table already exists');
    }
  } catch (error) {
    console.error('❌ Error creating withdrawal table:', error.message);
  }
}