const express = require('express');
const router = express.Router();
const GoldSecurity = require('../models/GoldSecurity');
const GoldHolding = require('../models/GoldHolding');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { transaction } = require('../config/database');

// Get all available gold securities
router.get('/', async (req, res) => {
  try {
    const securities = await GoldSecurity.findAll();
    
    const formatted = securities.map(sec => ({
      id: sec.id,
      name: sec.name,
      weightGrams: parseFloat(sec.weight_grams),
      purity: sec.purity,
      pricePerGram: parseFloat(sec.price_per_gram_usd),
      totalPrice: parseFloat(sec.total_price_usd),
      availableQuantity: sec.available_quantity,
      description: sec.description,
      imageUrl: sec.image_url,
      isActive: sec.is_active
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get securities error:', error);
    res.status(500).json({ message: 'Failed to fetch securities' });
  }
});

// Get gold security by ID
router.get('/:id', async (req, res) => {
  try {
    const security = await GoldSecurity.findById(req.params.id);
    
    if (!security) {
      return res.status(404).json({ message: 'Gold security not found' });
    }

    res.json({
      id: security.id,
      name: security.name,
      weightGrams: parseFloat(security.weight_grams),
      purity: security.purity,
      pricePerGram: parseFloat(security.price_per_gram_usd),
      totalPrice: parseFloat(security.total_price_usd),
      availableQuantity: security.available_quantity,
      description: security.description,
      imageUrl: security.image_url,
      isActive: security.is_active
    });
  } catch (error) {
    console.error('Get security error:', error);
    res.status(500).json({ message: 'Failed to fetch security' });
  }
});

// Purchase gold with crypto
router.post('/purchase', async (req, res) => {
  try {
    const { goldSecurityId, quantity, paymentCurrency } = req.body;

    if (!goldSecurityId || !quantity || !paymentCurrency) {
      return res.status(400).json({ message: 'Gold security ID, quantity, and payment currency are required' });
    }

    const result = await transaction(async (client) => {
      // Get gold security details
      const securityResult = await client.query(
        'SELECT * FROM gold_securities WHERE id = $1 AND is_active = true',
        [goldSecurityId]
      );

      if (securityResult.rows.length === 0) {
        throw new Error('Gold security not found or not available');
      }

      const security = securityResult.rows[0];

      // Check availability
      if (security.available_quantity < quantity) {
        throw new Error('Insufficient gold quantity available');
      }

      // Calculate costs
      const totalWeightGrams = parseFloat(security.weight_grams) * quantity;
      const pricePerGram = parseFloat(security.price_per_gram_usd);
      const totalPriceUsd = parseFloat(security.total_price_usd) * quantity;

      // Get crypto price
      const cryptoPrice = await client.query(
        'SELECT current_price_usd FROM crypto_currencies WHERE symbol = $1',
        [paymentCurrency.toUpperCase()]
      );

      if (cryptoPrice.rows.length === 0) {
        throw new Error('Unsupported payment currency');
      }

      const cryptoPriceUsd = parseFloat(cryptoPrice.rows[0].current_price_usd);
      const cryptoAmount = totalPriceUsd / cryptoPriceUsd;

      // Check user wallet balance
      const wallet = await client.query(
        'SELECT * FROM wallets WHERE user_id = $1',
        [req.user.id]
      );

      const currencyColumn = `${paymentCurrency.toLowerCase()}_balance`;
      const userBalance = wallet.rows.length > 0 ? parseFloat(wallet.rows[0][currencyColumn]) : 0;

      if (userBalance < cryptoAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct from user wallet
      await client.query(
        `UPDATE wallets 
         SET ${currencyColumn} = ${currencyColumn} - $1
         WHERE user_id = $2`,
        [cryptoAmount, req.user.id]
      );

      // Reduce gold availability
      await client.query(
        'UPDATE gold_securities SET available_quantity = available_quantity - $1 WHERE id = $2',
        [quantity, goldSecurityId]
      );

      // Create gold holding with SKR
      const holdingResult = await client.query(
        `INSERT INTO gold_holdings (
          user_id, gold_security_id, skr_reference, quantity, weight_grams,
          purchase_price_per_gram, total_paid_usd, payment_currency, payment_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'holding')
        RETURNING *`,
        [req.user.id, goldSecurityId, GoldHolding.generateSKRReference(), quantity, 
         totalWeightGrams, pricePerGram, totalPriceUsd, paymentCurrency.toUpperCase(), cryptoAmount]
      );

      const holding = holdingResult.rows[0];

      // Create transaction record
      await client.query(
        `INSERT INTO transactions (
          user_id, type, from_currency, to_currency, from_amount, to_amount,
          gold_security_id, skr_reference, exchange_rate, status, completed_at
        ) VALUES ($1, 'gold_purchase', $2, 'GOLD', $3, $4, $5, $6, $7, 'completed', CURRENT_TIMESTAMP)`,
        [req.user.id, paymentCurrency.toUpperCase(), cryptoAmount, totalWeightGrams, 
         goldSecurityId, holding.skr_reference, cryptoPriceUsd]
      );

      return holding;
    });

    res.status(201).json({
      message: 'Gold purchase successful!',
      skrReference: result.skr_reference,
      quantity,
      weightGrams: parseFloat(result.weight_grams),
      totalPaid: parseFloat(result.total_paid_usd),
      paymentCurrency: result.payment_currency,
      paymentAmount: parseFloat(result.payment_amount)
    });

  } catch (error) {
    console.error('Gold purchase error:', error);
    res.status(400).json({ message: error.message || 'Failed to purchase gold' });
  }
});

module.exports = router;


