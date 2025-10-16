const express = require('express');
const router = express.Router();
const cryptoPriceService = require('../services/cryptoPriceService');
const goldPriceService = require('../services/goldPriceService');
const { query } = require('../config/database');

// Get current real-time gold price
router.get('/gold/current', async (req, res) => {
  try {
    const priceData = await goldPriceService.getGoldPriceWithMetadata();
    res.json(priceData);
  } catch (error) {
    console.error('Get current gold price error:', error);
    res.status(500).json({ message: 'Failed to fetch current gold price' });
  }
});

// Get aggregated gold price series (per gram USD)
router.get('/gold', async (req, res) => {
  try {
    const { points = 30 } = req.query;
    // Use gold_price_history if available, otherwise synthesize from current prices
    const hist = await query(
      `SELECT created_at as t, price_per_gram_usd
       FROM gold_price_history
       ORDER BY created_at ASC
       LIMIT $1`,
      [parseInt(points)]
    );

    if (hist.rows.length) {
      return res.json({
        series: hist.rows.map(r => ({ t: r.t, pricePerGram: Number(r.price_per_gram_usd) }))
      });
    }

    // Fallback: use real-time price to generate series
    const currentPrice = await goldPriceService.getCurrentGoldPrice();
    const now = Date.now();
    const series = new Array(24).fill(0).map((_, i) => ({
      t: new Date(now - (24 - i) * 3600_000).toISOString(),
      pricePerGram: currentPrice * (1 + Math.sin(i / 4) * 0.01)
    }));
    res.json({ series });
  } catch (error) {
    console.error('Get gold price series error:', error);
    res.status(500).json({ message: 'Failed to fetch gold prices' });
  }
});

// Get current crypto prices (public endpoint - no auth required)
router.get('/crypto', async (req, res) => {
  try {
    const prices = await cryptoPriceService.getCurrentPrices();
    res.json(prices);
  } catch (error) {
    console.error('Get crypto prices error:', error);
    res.status(500).json({ message: 'Failed to fetch crypto prices' });
  }
});

// Get crypto price history
router.get('/crypto/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 24 } = req.query; // Default last 24 hours

    const result = await query(
      `SELECT currency_symbol, price_usd, created_at
       FROM crypto_price_history
       WHERE currency_symbol = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [symbol.toUpperCase(), limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({ message: 'Failed to fetch price history' });
  }
});

// Get gold price history
router.get('/gold/:securityId/history', async (req, res) => {
  try {
    const { limit = 30 } = req.query;

    const result = await query(
      `SELECT gph.*, u.full_name as changed_by_name
       FROM gold_price_history gph
       LEFT JOIN users u ON gph.changed_by = u.id
       WHERE gph.gold_security_id = $1
       ORDER BY gph.created_at DESC
       LIMIT $2`,
      [req.params.securityId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get gold price history error:', error);
    res.status(500).json({ message: 'Failed to fetch gold price history' });
  }
});

// Calculate exchange rate between currencies
router.get('/exchange-rate', async (req, res) => {
  try {
    const { from, to, amount = 1 } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: 'From and to currencies are required' });
    }

    const prices = await cryptoPriceService.getCurrentPrices();
    
    const fromPrice = prices[from.toUpperCase()] || 1;
    const toPrice = prices[to.toUpperCase()] || 1;
    
    const exchangeRate = fromPrice / toPrice;
    const convertedAmount = amount * exchangeRate;

    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: exchangeRate,
      inputAmount: parseFloat(amount),
      outputAmount: convertedAmount,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Calculate exchange rate error:', error);
    res.status(500).json({ message: 'Failed to calculate exchange rate' });
  }
});

// Calculate crypto to gold exchange
router.get('/exchange/crypto-to-gold', async (req, res) => {
  try {
    const { crypto, amount } = req.query;

    if (!crypto || !amount) {
      return res.status(400).json({ message: 'Crypto currency and amount are required' });
    }

    // Get crypto price
    const cryptoPrices = await cryptoPriceService.getCurrentPrices();
    const cryptoSymbol = crypto.toUpperCase();
    const cryptoPrice = cryptoPrices[cryptoSymbol];

    if (!cryptoPrice) {
      return res.status(400).json({ message: `Unsupported crypto currency: ${crypto}` });
    }

    // Calculate exchange
    const exchange = await goldPriceService.calculateCryptoToGold(
      parseFloat(amount),
      cryptoPrice
    );

    res.json(exchange);
  } catch (error) {
    console.error('Crypto to gold exchange error:', error);
    res.status(500).json({ message: 'Failed to calculate exchange' });
  }
});

// Calculate gold to crypto exchange
router.get('/exchange/gold-to-crypto', async (req, res) => {
  try {
    const { crypto, goldGrams } = req.query;

    if (!crypto || !goldGrams) {
      return res.status(400).json({ message: 'Crypto currency and gold grams are required' });
    }

    // Get crypto price
    const cryptoPrices = await cryptoPriceService.getCurrentPrices();
    const cryptoSymbol = crypto.toUpperCase();
    const cryptoPrice = cryptoPrices[cryptoSymbol];

    if (!cryptoPrice) {
      return res.status(400).json({ message: `Unsupported crypto currency: ${crypto}` });
    }

    // Calculate exchange
    const exchange = await goldPriceService.calculateGoldToCrypto(
      parseFloat(goldGrams),
      cryptoPrice
    );

    res.json(exchange);
  } catch (error) {
    console.error('Gold to crypto exchange error:', error);
    res.status(500).json({ message: 'Failed to calculate exchange' });
  }
});

module.exports = router;


