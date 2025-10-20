const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const auth = require('./auth');
const goldPriceService = require('../services/goldPriceService');
const cryptoPriceService = require('../services/cryptoPriceService');
const Wallet = require('../models/Wallet');

/**
 * Exchange crypto to gold credits
 * POST /api/gold-exchange/crypto-to-gold
 */
router.post('/crypto-to-gold', auth.authenticateToken, async (req, res) => {
  const client = await require('../config/database').pool.connect();
  
  try {
    await client.query('BEGIN');

    const { cryptoCurrency, cryptoAmount } = req.body;
    const userId = req.user.id;

    // Validation
    if (!cryptoCurrency || !cryptoAmount || cryptoAmount <= 0) {
      return res.status(400).json({ message: 'Invalid crypto currency or amount' });
    }

    // Check platform balance from user_balances (off-chain credits)
    const upperSymbol = (cryptoCurrency || '').toUpperCase();
    if (!['BTC', 'ETH', 'USDT'].includes(upperSymbol)) {
      return res.status(400).json({ message: `Unsupported crypto currency: ${cryptoCurrency}` });
    }

    const balanceResult = await query(
      `SELECT balance FROM user_balances WHERE user_id = $1 AND currency = $2`,
      [userId, upperSymbol]
    );
    const cryptoBalance = parseFloat(balanceResult.rows[0]?.balance || 0);

    if (cryptoBalance < cryptoAmount) {
      return res.status(400).json({
        message: `Insufficient ${upperSymbol} balance`,
        available: cryptoBalance,
        requested: cryptoAmount
      });
    }

    // Get current prices
    const cryptoPrices = await cryptoPriceService.getCurrentPrices();
    const cryptoPriceUSD =
      upperSymbol === 'BTC' ? cryptoPrices.BTC :
      upperSymbol === 'ETH' ? cryptoPrices.ETH :
      upperSymbol === 'USDT' ? cryptoPrices.USDT : undefined;

    if (!cryptoPriceUSD || cryptoPriceUSD <= 0) {
      return res.status(400).json({ message: `Price unavailable for ${upperSymbol}` });
    }

    const goldPricePerGram = await goldPriceService.getCurrentGoldPrice();
    if (!goldPricePerGram || goldPricePerGram <= 0) {
      return res.status(400).json({ message: 'Gold price unavailable' });
    }

    // Calculate exchange
    const cryptoValueUSD = cryptoAmount * cryptoPriceUSD;
    const goldGrams = cryptoValueUSD / goldPricePerGram;

    // Platform fee (0.5%)
    const feeRate = 0.005;
    const fee = goldGrams * feeRate;
    const netGoldGrams = goldGrams - fee;

    // Ensure balance row exists then deduct crypto from user_balances
    await client.query(
      `INSERT INTO user_balances (user_id, currency, balance, available_balance, updated_at)
       VALUES ($1, $2, 0, 0, NOW())
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [userId, upperSymbol]
    );

    const updateResult = await client.query(
      `UPDATE user_balances 
       SET balance = balance - $1, available_balance = available_balance - $1, updated_at = NOW()
       WHERE user_id = $2 AND currency = $3`,
      [cryptoAmount, userId, upperSymbol]
    );

    if ((updateResult.rowCount || 0) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Failed to debit balance' });
    }

    // Add gold credits (stored in gold_holdings table) - align with live schema requiring skr_reference
    const feeUsd = fee * goldPricePerGram;
    const totalPaidUsd = cryptoValueUSD - feeUsd;
    const GoldHoldingModel = require('../models/GoldHolding');
    const skrReference = (GoldHoldingModel && GoldHoldingModel.generateSKRReference)
      ? GoldHoldingModel.generateSKRReference()
      : `SKR-${Date.now()}`;

    const goldHolding = await client.query(
      `INSERT INTO gold_holdings (
        user_id, gold_security_id, skr_reference, quantity, weight_grams,
        purchase_price_per_gram, total_paid_usd, payment_currency, payment_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'holding')
      RETURNING *`,
      [
        userId,
        null, // gold_security_id not applicable for simple exchange
        skrReference,
        1, // quantity unit
        netGoldGrams,
        goldPricePerGram,
        totalPaidUsd,
        upperSymbol,
        cryptoAmount
      ]
    );

    // Create transaction record (ledger) using meta JSON
    await client.query(
      `INSERT INTO transactions_ledger (
        user_id, type, currency, amount, reference_id, meta, created_at
      ) VALUES ($1, 'buy_gold', $2, $3, $4, $5, NOW())`,
      [
        userId,
        upperSymbol,
        cryptoAmount,
        `buy_${Date.now()}`,
        JSON.stringify({
          description: `Bought ${netGoldGrams.toFixed(6)} g gold with ${cryptoAmount} ${upperSymbol}`,
          status: 'completed',
          goldGramsNet: netGoldGrams,
          goldPricePerGram,
          cryptoPriceUSD
        })
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Exchange successful',
      exchange: {
        cryptoCurrency: cryptoCurrency.toUpperCase(),
        cryptoAmount,
        cryptoPriceUSD,
        cryptoValueUSD,
        goldPricePerGram,
        goldGramsGross: goldGrams,
        fee: fee,
        goldGramsNet: netGoldGrams,
        holding: goldHolding.rows[0]
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Crypto to gold exchange error:', error);
    res.status(500).json({ message: 'Exchange failed', error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Exchange gold credits back to crypto
 * POST /api/gold-exchange/gold-to-crypto
 */
router.post('/gold-to-crypto', auth.authenticateToken, async (req, res) => {
  const client = await require('../config/database').pool.connect();
  
  try {
    await client.query('BEGIN');

    const { cryptoCurrency, goldGrams } = req.body;
    const userId = req.user.id;

    // Validation
    if (!cryptoCurrency || !goldGrams || goldGrams <= 0) {
      return res.status(400).json({ message: 'Invalid crypto currency or gold amount' });
    }

    // Get user's total gold holdings (status 'holding')
    const holdingsResult = await client.query(
      `SELECT SUM(weight_grams) as total_gold FROM gold_holdings 
       WHERE user_id = $1 AND status = 'holding'`,
      [userId]
    );

    const totalGold = parseFloat(holdingsResult.rows[0]?.total_gold || 0);

    if (totalGold < goldGrams) {
      return res.status(400).json({ 
        message: 'Insufficient gold balance',
        available: totalGold,
        requested: goldGrams
      });
    }

    // Get current prices
    const cryptoPrices = await cryptoPriceService.getCurrentPrices();
    const upperSymbol = cryptoCurrency.toUpperCase();
    const cryptoPriceUSD =
      upperSymbol === 'BTC' ? cryptoPrices.BTC :
      upperSymbol === 'ETH' ? cryptoPrices.ETH :
      upperSymbol === 'USDT' ? cryptoPrices.USDT : undefined;

    if (!cryptoPriceUSD) {
      return res.status(400).json({ message: `Unsupported crypto currency: ${cryptoCurrency}` });
    }

    const goldPricePerGram = await goldPriceService.getCurrentGoldPrice();

    // Calculate exchange
    const goldValueUSD = goldGrams * goldPricePerGram;
    const cryptoAmount = goldValueUSD / cryptoPriceUSD;

    // Platform fee (0.5%)
    const feeRate = 0.005;
    const fee = cryptoAmount * feeRate;
    const netCryptoAmount = cryptoAmount - fee;

    // Deduct gold (mark holdings as redeemed)
    let remainingGold = goldGrams;
    const holdings = await client.query(
      `SELECT * FROM gold_holdings 
       WHERE user_id = $1 AND status = 'holding' 
       ORDER BY created_at ASC`,
      [userId]
    );

    for (const holding of holdings.rows) {
      if (remainingGold <= 0) break;

      const deductAmount = Math.min(remainingGold, parseFloat(holding.weight_grams));
      
      if (deductAmount >= parseFloat(holding.weight_grams)) {
        // Fully consume this holding -> mark as sold
        await client.query(
          `UPDATE gold_holdings SET status = 'sold', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [holding.id]
        );
      } else {
        // Partially consume this holding
        await client.query(
          `UPDATE gold_holdings SET weight_grams = weight_grams - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [deductAmount, holding.id]
        );
      }

      remainingGold -= deductAmount;
    }

    // Add crypto to user_balances
    await client.query(
      `INSERT INTO user_balances (user_id, currency, balance, available_balance, updated_at)
       VALUES ($1, $2, $3, $3, NOW())
       ON CONFLICT (user_id, currency)
       DO UPDATE SET balance = user_balances.balance + $3, available_balance = user_balances.available_balance + $3, updated_at = NOW()`,
      [userId, upperSymbol, netCryptoAmount]
    );

    // Create transaction record (ledger) using meta JSON
    await client.query(
      `INSERT INTO transactions_ledger (
        user_id, type, currency, amount, reference_id, meta, created_at
      ) VALUES ($1, 'sell_gold', $2, $3, $4, $5, NOW())`,
      [
        userId,
        upperSymbol,
        netCryptoAmount,
        `sell_${Date.now()}`,
        JSON.stringify({
          description: `Sold ${goldGrams.toFixed(6)} g gold for ${netCryptoAmount.toFixed(8)} ${upperSymbol}`,
          status: 'completed',
          goldGrams,
          goldPricePerGram,
          cryptoPriceUSD
        })
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Exchange successful',
      exchange: {
        goldGrams,
        goldPricePerGram,
        goldValueUSD,
        cryptoCurrency: cryptoCurrency.toUpperCase(),
        cryptoPriceUSD,
        cryptoAmountGross: cryptoAmount,
        fee: fee,
        cryptoAmountNet: netCryptoAmount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Gold to crypto exchange error:', error);
    res.status(500).json({ message: 'Exchange failed', error: error.message });
  } finally {
    client.release();
  }
});

/**
 * Get user's gold holdings
 * GET /api/gold-exchange/holdings
 */
router.get('/holdings', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT * FROM gold_holdings 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Count both legacy 'active' and new 'holding' statuses
    const totalActive = await query(
      `SELECT COALESCE(SUM(weight_grams), 0) as total FROM gold_holdings 
       WHERE user_id = $1 AND status IN ('active','holding')`,
      [userId]
    );

    res.json({
      holdings: result.rows,
      totalActiveGrams: parseFloat(totalActive.rows[0]?.total || 0)
    });

  } catch (error) {
    console.error('Get holdings error:', error);
    res.status(500).json({ message: 'Failed to fetch holdings' });
  }
});

module.exports = router;



