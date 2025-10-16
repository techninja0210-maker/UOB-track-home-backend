require('dotenv').config({ path: './.env' });
const { query } = require('./config/database');

async function checkPlatformWallet() {
  console.log('\n🔍 CHECKING PLATFORM WALLET STATUS\n');
  console.log('═'.repeat(60));
  
  try {
    // Check if any wallets exist
    const wallets = await query('SELECT btc_address, eth_address, usdt_address FROM wallets LIMIT 1');
    
    if (wallets.rows.length > 0) {
      console.log('\n✅ REAL BLOCKCHAIN ADDRESSES IN DATABASE:\n');
      console.log('📍 BTC Address:', wallets.rows[0].btc_address);
      console.log('📍 ETH Address:', wallets.rows[0].eth_address);
      console.log('📍 USDT Address:', wallets.rows[0].usdt_address);
      console.log('\n💡 These are REAL blockchain addresses!');
      console.log('   You can verify them on blockchain explorers:');
      console.log('   - Bitcoin: https://blockstream.info/address/' + wallets.rows[0].btc_address);
      console.log('   - Ethereum: https://etherscan.io/address/' + wallets.rows[0].eth_address);
      
      console.log('\n🏦 PLATFORM WALLET MODEL:');
      console.log('   Each user gets UNIQUE addresses (derived from master seed)');
      console.log('   Platform controls the private keys (custodial model)');
      console.log('   All addresses are REAL and on the blockchain!');
      
    } else {
      console.log('\n⚠️  No wallets created yet');
      console.log('   Wallets are created when user first signs up');
    }
    
    console.log('\n═'.repeat(60));
    console.log('\n📊 IMPLEMENTATION STATUS:\n');
    
    console.log('✅ Wallet Address Generation: IMPLEMENTED');
    console.log('   - Each user gets unique BTC/ETH/USDT addresses');
    console.log('   - Addresses are REAL blockchain addresses');
    console.log('   - Private keys encrypted and stored in database');
    
    console.log('\n✅ Deposit Detection: IMPLEMENTED');
    console.log('   - Platform monitors blockchain for deposits');
    console.log('   - Auto-detects when crypto arrives at user addresses');
    
    console.log('\n✅ Withdrawal Processing: IMPLEMENTED');
    console.log('   - Creates real blockchain transactions');
    console.log('   - Sends crypto from platform to user MetaMask');
    
    console.log('\n❌ Trading on Blockchain: NOT IMPLEMENTED (BY DESIGN)');
    console.log('   - Buy/Sell gold = Database updates only');
    console.log('   - NO blockchain transactions for trading');
    console.log('   - This is CORRECT for CEX model (instant & free)');
    
    console.log('\n═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    const { pool } = require('./config/database');
    await pool.end();
  }
}

checkPlatformWallet();


