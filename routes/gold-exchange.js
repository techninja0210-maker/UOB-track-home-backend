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

    // Get user's wallet
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    // Check crypto balance
    const cryptoBalanceColumn = `${cryptoCurrency.toLowerCase()}_balance`;
    const cryptoBalance = parseFloat(wallet[cryptoBalanceColumn] || 0);

    if (cryptoBalance < cryptoAmount) {
      return res.status(400).json({ 
        message: `Insufficient ${cryptoCurrency} balance`,
        available: cryptoBalance,
        requested: cryptoAmount
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
    const cryptoValueUSD = cryptoAmount * cryptoPriceUSD;
    const goldGrams = cryptoValueUSD / goldPricePerGram;

    // Platform fee (0.5%)
    const feeRate = 0.005;
    const fee = goldGrams * feeRate;
    const netGoldGrams = goldGrams - fee;

    // Deduct crypto from wallet
    await client.query(
      `UPDATE wallets SET ${cryptoBalanceColumn} = ${cryptoBalanceColumn} - $1 WHERE user_id = $2`,
      [cryptoAmount, userId]
    );

    // Add gold credits (stored in gold_holdings table)
    const goldHolding = await client.query(
      `INSERT INTO gold_holdings (
        user_id, 
        weight_grams, 
        purchase_price_per_gram, 
        total_value_usd,
        source_crypto,
        source_crypto_amount,
        fee_grams,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *`,
      [
        userId,
        netGoldGrams,
        goldPricePerGram,
        cryptoValueUSD - (fee * goldPricePerGram),
        cryptoCurrency.toUpperCase(),
        cryptoAmount,
        fee
      ]
    );

    // Create transaction record
    await client.query(
      `INSERT INTO transactions (
        user_id,
        type,
        from_currency,
        from_amount,
        to_currency,
        to_amount,
        exchange_rate,
        fee_amount,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        'crypto_to_gold',
        cryptoCurrency.toUpperCase(),
        cryptoAmount,
        'GOLD',
        netGoldGrams,
        goldPricePerGram / cryptoPriceUSD,
        fee,
        'completed'
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

    // Get user's total gold holdings
    const holdingsResult = await client.query(
      `SELECT SUM(weight_grams) as total_gold FROM gold_holdings 
       WHERE user_id = $1 AND status = 'active'`,
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
       WHERE user_id = $1 AND status = 'active' 
       ORDER BY created_at ASC`,
      [userId]
    );

    for (const holding of holdings.rows) {
      if (remainingGold <= 0) break;

      const deductAmount = Math.min(remainingGold, holding.weight_grams);
      
      if (deductAmount >= holding.weight_grams) {
        // Fully consume this holding
        await client.query(
          `UPDATE gold_holdings SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [holding.id]
        );
      } else {
        // Partially consume this holding
        await client.query(
          `UPDATE gold_holdings SET weight_grams = weight_grams - $1 
           WHERE id = $2`,
          [deductAmount, holding.id]
        );
      }

      remainingGold -= deductAmount;
    }

    // Add crypto to wallet
    const cryptoBalanceColumn = `${cryptoCurrency.toLowerCase()}_balance`;
    await client.query(
      `UPDATE wallets SET ${cryptoBalanceColumn} = ${cryptoBalanceColumn} + $1 WHERE user_id = $2`,
      [netCryptoAmount, userId]
    );

    // Create transaction record
    await client.query(
      `INSERT INTO transactions (
        user_id,
        type,
        from_currency,
        from_amount,
        to_currency,
        to_amount,
        exchange_rate,
        fee_amount,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        'gold_to_crypto',
        'GOLD',
        goldGrams,
        cryptoCurrency.toUpperCase(),
        netCryptoAmount,
        cryptoPriceUSD / goldPricePerGram,
        fee,
        'completed'
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

    const totalActive = await query(
      `SELECT SUM(weight_grams) as total FROM gold_holdings 
       WHERE user_id = $1 AND status = 'active'`,
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



