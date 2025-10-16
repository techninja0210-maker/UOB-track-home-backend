require('dotenv').config({ path: './.env' });
const goldPriceService = require('./services/goldPriceService');

async function testGoldPrice() {
  console.log('\n💰 Testing Gold Price API...\n');
  
  try {
    // Test Gold Price
    console.log('📡 Fetching real-time gold price from Metals.dev...');
    const priceData = await goldPriceService.getGoldPriceWithMetadata();
    
    console.log('\n✅ Success!\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 GOLD PRICE DATA:');
    console.log('═══════════════════════════════════════════════════');
    console.log(`💰 Price per gram: $${priceData.pricePerGram}`);
    console.log(`💵 Currency: ${priceData.currency}`);
    console.log(`⚖️  Unit: ${priceData.unit}`);
    console.log(`🔗 Source: ${priceData.source}`);
    console.log(`📅 Timestamp: ${priceData.timestamp}`);
    console.log(`💾 Cached: ${priceData.cached ? 'Yes' : 'No (Fresh)'}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Test Calculations
    console.log('🧮 Testing Exchange Calculations...\n');
    
    const btcToGold = await goldPriceService.calculateCryptoToGold(0.01, 45000);
    console.log('📈 0.01 BTC ($45,000/BTC) → Gold:');
    console.log(`   Crypto Value: $${btcToGold.cryptoValueUSD}`);
    console.log(`   Gold Grams: ${btcToGold.goldGrams}g\n`);

    const goldToEth = await goldPriceService.calculateGoldToCrypto(10, 2500);
    console.log('📉 10g Gold → ETH ($2,500/ETH):');
    console.log(`   Gold Value: $${goldToEth.goldValueUSD}`);
    console.log(`   ETH Amount: ${goldToEth.cryptoAmount} ETH\n`);

    console.log('🎉 Gold Price API is working perfectly!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  }
}

testGoldPrice();



