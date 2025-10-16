require('dotenv').config();

console.log('🔍 Checking Backend Configuration...\n');

// Check environment variables
console.log('1️⃣ Environment Variables:');
console.log('   PORT:', process.env.PORT || '5000');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('   WALLET_ENCRYPTION_KEY:', process.env.WALLET_ENCRYPTION_KEY ? '✅ Set' : '❌ Not set');
console.log('   MASTER_WALLET_SEED:', process.env.MASTER_WALLET_SEED ? '✅ Set' : '❌ Not set');
console.log('');

// Check required files
const fs = require('fs');
const path = require('path');

console.log('2️⃣ Required Files:');
const requiredFiles = [
  'routes/wallet.js',
  'services/walletAddressService.js',
  'models/Wallet.js',
  'config/database.js'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});
console.log('');

// Try to load the wallet service
console.log('3️⃣ Loading Wallet Service:');
try {
  const walletService = require('./services/walletAddressService');
  console.log('   ✅ Wallet service loaded');
} catch (error) {
  console.log('   ❌ Error loading wallet service:', error.message);
}
console.log('');

// Try to load routes
console.log('4️⃣ Loading Wallet Routes:');
try {
  const walletRoutes = require('./routes/wallet');
  console.log('   ✅ Wallet routes loaded');
} catch (error) {
  console.log('   ❌ Error loading wallet routes:', error.message);
  console.log('   Error details:', error.stack);
}
console.log('');

console.log('5️⃣ Starting Server Test...');
console.log('   Now try: npm run dev');
console.log('   You should see: "Server running on port 5000"');
console.log('');



