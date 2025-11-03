/**
 * Real-time Gold Price Service
 * Fetches gold prices at regular intervals and broadcasts via WebSocket
 * Similar to TradingView's real-time updates
 */

const goldPriceService = require('./goldPriceService');
const { query } = require('../config/database');

class RealtimeGoldPriceService {
  constructor() {
    this.io = null;
    this.updateInterval = null;
    this.currentPrice = null;
    this.updateFrequency = 300000; // Update every 5 minutes (to avoid rate limits with free APIs and reduce load)
    this.isRunning = false;
    this.lastUpdateAttempt = null;
  }

  /**
   * Initialize with Socket.IO instance
   */
  initialize(io) {
    this.io = io;
    console.log('✅ Real-time gold price service initialized');
  }

  /**
   * Start real-time price updates
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Real-time gold price service already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Starting real-time gold price updates (every ${this.updateFrequency / 1000}s)`);
    console.log(`📡 WebSocket server status: ${this.io ? 'Initialized' : 'NOT INITIALIZED'}`);
    console.log(`💡 Note: TradingView WebSocket is the primary source (no API key required)`);
    console.log(`💡 This service runs as fallback if TradingView WebSocket fails`);

    // Fetch immediately (but with a small delay to ensure server is ready)
    setTimeout(() => {
      this.updatePrice();
    }, 2000);

    // Then update at regular intervals
    this.updateInterval = setInterval(() => {
      this.updatePrice();
    }, this.updateFrequency);
  }

  /**
   * Stop real-time price updates
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Real-time gold price service stopped');
  }

  /**
   * Update gold price and broadcast to all clients
   */
  async updatePrice() {
    try {
      this.lastUpdateAttempt = new Date();
      console.log(`🔄 [${new Date().toLocaleTimeString()}] Fetching fresh gold price...`);
      
      // Force refresh to get latest price (bypass cache)
      const pricePerGram = await goldPriceService.getCurrentGoldPrice(true);
      
      if (!pricePerGram || isNaN(pricePerGram) || pricePerGram <= 0) {
        console.error('❌ Invalid gold price received:', pricePerGram);
        // Don't update if price is invalid - keep previous price
        if (this.currentPrice) {
          console.log('📊 Keeping previous price due to invalid response');
          return;
        }
        // If no previous price, try one more time after delay
        setTimeout(() => this.updatePrice(), 10000);
        return;
      }
      
      console.log(`✅ Gold price fetched: $${pricePerGram.toFixed(2)}/gram`);

      // Calculate price per troy ounce for display
      const pricePerOunce = pricePerGram * 31.1035;

      // Get 24h change
      let change24h = 0;
      try {
        const nowRow = await query(`
          SELECT price_per_gram_usd, created_at
          FROM gold_price_history
          ORDER BY created_at DESC
          LIMIT 1
        `);
        
        const prevRow = await query(`
          SELECT price_per_gram_usd, created_at
          FROM gold_price_history
          WHERE created_at >= NOW() - INTERVAL '26 hours'
            AND created_at <= NOW() - INTERVAL '23 hours'
          ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - (NOW() - INTERVAL '24 hours'))))
          LIMIT 1
        `);
        
        if (nowRow.rows[0] && prevRow.rows[0]) {
          const latest = Number(nowRow.rows[0].price_per_gram_usd);
          const prev = Number(prevRow.rows[0].price_per_gram_usd);
          if (prev > 0) {
            change24h = ((latest - prev) / prev) * 100;
          }
        }
      } catch (err) {
        console.log('24h change calculation error:', err.message);
      }

      // Store in database for history (if table exists) - Non-blocking with timeout
      // Don't wait for database write - it's non-critical for real-time updates
      const storeHistory = async () => {
        try {
          // Check if table exists first (with timeout)
          const tableCheckPromise = query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'gold_price_history'
            );
          `);
          
          // Set 3 second timeout for table check
          const tableCheck = await Promise.race([
            tableCheckPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Table check timeout')), 3000)
            )
          ]);
          
          if (tableCheck.rows[0].exists) {
            // Insert with timeout protection
            const insertPromise = query(`
              INSERT INTO gold_price_history (price_per_gram_usd, created_at)
              VALUES ($1, NOW())
            `, [pricePerGram]);
            
            // Set 5 second timeout for insert
            await Promise.race([
              insertPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Insert timeout')), 5000)
              )
            ]);
          }
        } catch (dbError) {
          // Non-critical - silently fail (don't log every time to reduce noise)
          // Only log if it's not a timeout (timeouts are expected)
          if (dbError && dbError.message && !dbError.message.includes('timeout') && !dbError.message.includes('Timeout')) {
            console.log('Price history storage error (non-critical):', dbError.message);
          }
        }
      };
      
      // Run asynchronously without blocking
      storeHistory().catch(() => {}); // Silently handle any unhandled errors

      // Get exchange rates for EUR and GBP
      let eurRate = 0.85;
      let gbpRate = 0.78;
      try {
        const axios = require('axios');
        const exchangeResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
          timeout: 3000
        });
        if (exchangeResponse.data && exchangeResponse.data.rates) {
          eurRate = exchangeResponse.data.rates.EUR || 0.85;
          gbpRate = exchangeResponse.data.rates.GBP || 0.78;
        }
      } catch (exchangeError) {
        // Use defaults if exchange rate API fails
        console.log('Exchange rate API failed, using defaults');
      }

      // Calculate prices in different currencies
      const eurPricePerGram = pricePerGram * eurRate;
      const gbpPricePerGram = pricePerGram * gbpRate;

      // Update current price
      const previousPrice = this.currentPrice;
      this.currentPrice = {
        pricePerGram: parseFloat(pricePerGram.toFixed(2)),
        pricePerOunce: parseFloat(pricePerOunce.toFixed(2)),
        eurPricePerGram: parseFloat(eurPricePerGram.toFixed(2)),
        gbpPricePerGram: parseFloat(gbpPricePerGram.toFixed(2)),
        change24h: parseFloat(change24h.toFixed(2)),
        timestamp: new Date().toISOString(),
        previousPrice: previousPrice?.pricePerGram || pricePerGram
      };

      // Broadcast to all connected clients via WebSocket
      if (this.io) {
        this.io.emit('gold-price-update', {
          price: this.currentPrice.pricePerGram,
          pricePerOunce: this.currentPrice.pricePerOunce,
          eurPrice: this.currentPrice.eurPricePerGram,
          gbpPrice: this.currentPrice.gbpPricePerGram,
          change24h: this.currentPrice.change24h,
          timestamp: this.currentPrice.timestamp,
          previousPrice: this.currentPrice.previousPrice
        });

        console.log(`📡 Broadcasted gold price: USD $${this.currentPrice.pricePerGram}/gram, EUR €${this.currentPrice.eurPricePerGram}/gram, GBP £${this.currentPrice.gbpPricePerGram}/gram (${this.currentPrice.change24h >= 0 ? '+' : ''}${this.currentPrice.change24h.toFixed(2)}%)`);
        
        // Also log how many clients are connected
        if (this.io && this.io.sockets) {
          const connectedClients = this.io.sockets.sockets.size;
          console.log(`📊 Connected clients: ${connectedClients}`);
        }
      } else {
        console.warn('⚠️ Socket.IO not initialized, cannot broadcast price updates');
      }
    } catch (error) {
      console.error('❌ Error updating real-time gold price:', {
        message: error.message,
        stack: error.stack
      });
      
      // If we have a previous price, keep using it
      if (this.currentPrice) {
        console.log('📊 Using previous cached price due to error');
        // Still try to broadcast the cached price
        if (this.io) {
          this.io.emit('gold-price-update', {
            price: this.currentPrice.pricePerGram,
            pricePerOunce: this.currentPrice.pricePerOunce,
            eurPrice: this.currentPrice.eurPricePerGram,
            gbpPrice: this.currentPrice.gbpPricePerGram,
            change24h: this.currentPrice.change24h,
            timestamp: this.currentPrice.timestamp,
            previousPrice: this.currentPrice.previousPrice
          });
        }
      }
    }
  }

  /**
   * Get current cached price
   */
  getCurrentPrice() {
    return this.currentPrice;
  }

  /**
   * Set update frequency (in milliseconds)
   */
  setUpdateFrequency(ms) {
    this.updateFrequency = ms;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

module.exports = new RealtimeGoldPriceService();

