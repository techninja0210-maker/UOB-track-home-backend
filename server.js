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
    console.error('❌ Database connection error:', err);
    process.exit(1);
  } else {
    console.log('✅ PostgreSQL database connected successfully');
    console.log('📊 Database time:', res.rows[0].now);
  }
});

// Initialize pool wallets
const poolWalletService = require('./services/poolWalletService');
poolWalletService.initializePoolWallets().catch(err => {
  console.error('❌ Pool wallet initialization error:', err);
  // Don't exit - server can still run without pool wallets
});

// Authentication middleware
const authRoutes = require('./routes/auth');

// Start crypto price updates
const cryptoPriceService = require('./services/cryptoPriceService');
cryptoPriceService.startPriceUpdates(60000); // Update every minute

// Start pool wallet blockchain monitoring
const poolBlockchainMonitor = require('./services/poolBlockchainMonitor');
// Start monitoring after a 10-second delay (allow server to fully initialize)
setTimeout(() => {
  poolBlockchainMonitor.startMonitoring().catch(console.error);
}, 10000);

// Initialize WebSocket notifications
const notificationService = require('./services/notificationService');
notificationService.initialize(io);

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