const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const GoldHolding = require('../models/GoldHolding');
const noonesApi = require('../services/noonesApiService');

// POST /api/exchange/quote
// body: { cryptoSymbol: 'USDT'|'BTC', cryptoAmount: number, target: 'GOLD_GRAMS' }
router.post('/quote', async (req, res) => {
  try {
    const { cryptoSymbol, cryptoAmount } = req.body;
    if (!cryptoSymbol || !cryptoAmount || cryptoAmount <= 0) {
      return res.status(400).json({ message: 'cryptoSymbol and cryptoAmount are required' });
    }

    // Try Noones API first for quote
    try {
      const noonesQuote = await noonesApi.getExchangeQuote(cryptoSymbol, cryptoAmount, 'GOLD');
      if (noonesQuote && noonesQuote.success) {
        return res.json({
          cryptoSymbol: cryptoSymbol.toUpperCase(),
          cryptoAmount: Number(cryptoAmount),
          estimatedGoldGrams: noonesQuote.gold_grams,
          pricePerGramUsd: noonesQuote.gold_price_per_gram,
          feeUsd: noonesQuote.fee_usd,
          totalUsd: noonesQuote.total_usd,
          source: 'noones'
        });
      }
    } catch (noonesError) {
      console.log('Noones API quote failed, using fallback:', noonesError.message);
    }

    // Fallback: fetch BTC/USDT prices (USDT = 1 by definition)
    let usd = Number(cryptoAmount);
    if (cryptoSymbol.toUpperCase() !== 'USDT') {
      const price = await query(`SELECT current_price_usd FROM crypto_currencies WHERE symbol = $1`, [cryptoSymbol.toUpperCase()]);
      const p = Number(price.rows[0]?.current_price_usd || (cryptoSymbol.toUpperCase() === 'BTC' ? 45000 : 1));
      usd = Number(cryptoAmount) * p;
    }

    const gold = await query(`SELECT COALESCE(AVG(price_per_gram_usd), 70) as g FROM gold_securities WHERE is_active = true`);
    const pricePerGramUsd = Number(gold.rows[0]?.g || 70);
    const estimatedGoldGrams = usd / pricePerGramUsd;
    const feeUsd = Math.max(1, usd * 0.005);

    res.json({
      cryptoSymbol: cryptoSymbol.toUpperCase(),
      cryptoAmount: Number(cryptoAmount),
      estimatedGoldGrams,
      pricePerGramUsd,
      feeUsd,
      totalUsd: usd,
      source: 'fallback'
    });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ message: 'Failed to calculate quote' });
  }
});

// POST /api/exchange/trade
// body: { cryptoSymbol, cryptoAmount, goldGrams, goldSecurityId? }
router.post('/trade', async (req, res) => {
  try {
    const userId = req.user.id;
    const { cryptoSymbol, cryptoAmount, goldGrams, goldSecurityId = null } = req.body;
    if (!cryptoSymbol || !cryptoAmount || !goldGrams) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    const symbol = cryptoSymbol.toUpperCase();

    // Try Noones API first for trade execution
    try {
      const noonesTrade = await noonesApi.createExchange(userId, symbol, cryptoAmount, goldGrams);
      if (noonesTrade && noonesTrade.success) {
        // Create local records for tracking
        const result = await transaction(async (client) => {
          // Get gold price
          const gold = await client.query(`SELECT id, price_per_gram_usd FROM gold_securities WHERE is_active = true ORDER BY price_per_gram_usd LIMIT 1`);
          const goldPrice = Number(gold.rows[0]?.price_per_gram_usd || 70);
          const usedSecurityId = goldSecurityId || gold.rows[0]?.id || null;
          const totalUsd = goldGrams * goldPrice;

          // Create gold holding (SKR)
          const holding = await GoldHolding.create({
            userId,
            goldSecurityId: usedSecurityId,
            quantity: 1,
            weightGrams: goldGrams,
            purchasePricePerGram: goldPrice,
            totalPaidUsd: totalUsd,
            paymentCurrency: symbol,
            paymentAmount: cryptoAmount
          });

          // Create transaction record
          const tx = await Transaction.create({
            userId,
            type: 'crypto_to_gold',
            fromCurrency: symbol,
            toCurrency: 'GOLD',
            fromAmount: cryptoAmount,
            toAmount: goldGrams,
            goldSecurityId: usedSecurityId,
            skrReference: holding.skr_reference,
            exchangeRate: goldPrice,
            platformFee: totalUsd * 0.005,
            status: 'completed'
          });

          return { holding, tx, noonesTrade };
        });

        return res.status(201).json({ 
          message: 'Exchange completed via Noones API', 
          ...result,
          source: 'noones'
        });
      }
    } catch (noonesError) {
      console.log('Noones API trade failed, using fallback:', noonesError.message);
    }

    // Fallback: local transaction
    const result = await transaction(async (client) => {
      // Ensure wallet exists and has enough balance for crypto (if non-custodial deposit logic is used, skip check)
      const wallet = await Wallet.getOrCreate(userId);
      const column = `${symbol.toLowerCase()}_balance`;
      const currentBal = Number(wallet[column] || 0);
      if (currentBal < Number(cryptoAmount)) {
        throw new Error('Insufficient balance');
      }

      // Deduct crypto from wallet
      await client.query(`UPDATE wallets SET ${column} = ${column} - $1 WHERE user_id = $2`, [cryptoAmount, userId]);

      // Get gold price
      const gold = await client.query(`SELECT id, price_per_gram_usd FROM gold_securities WHERE is_active = true ORDER BY price_per_gram_usd LIMIT 1`);
      const goldPrice = Number(gold.rows[0]?.price_per_gram_usd || 70);
      const usedSecurityId = goldSecurityId || gold.rows[0]?.id || null;
      const totalUsd = goldGrams * goldPrice;

      // Create gold holding (SKR)
      const holding = await GoldHolding.create({
        userId,
        goldSecurityId: usedSecurityId,
        quantity: 1,
        weightGrams: goldGrams,
        purchasePricePerGram: goldPrice,
        totalPaidUsd: totalUsd,
        paymentCurrency: symbol,
        paymentAmount: cryptoAmount
      });

      // Create transaction record
      const tx = await Transaction.create({
        userId,
        type: 'crypto_to_gold',
        fromCurrency: symbol,
        toCurrency: 'GOLD',
        fromAmount: cryptoAmount,
        toAmount: goldGrams,
        goldSecurityId: usedSecurityId,
        skrReference: holding.skr_reference,
        exchangeRate: goldPrice,
        platformFee: totalUsd * 0.005,
        status: 'completed'
      });

      return { holding, tx };
    });

    res.status(201).json({ message: 'Exchange completed', ...result });
  } catch (error) {
    console.error('Trade error:', error);
    res.status(400).json({ message: error.message || 'Failed to complete trade' });
  }
});

// Test Noones API connection
router.get('/test-noones', async (req, res) => {
  try {
    const connectionTest = await noonesApi.testConnection();
    res.json({
      message: 'Noones API connection test',
      ...connectionTest
    });
  } catch (error) {
    console.error('Noones API test error:', error);
    res.status(500).json({ 
      message: 'Noones API test failed',
      error: error.message 
    });
  }
});

module.exports = router;


