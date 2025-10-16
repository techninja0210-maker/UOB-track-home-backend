const express = require('express');
const router = express.Router();
const GoldHolding = require('../models/GoldHolding');
const { query } = require('../config/database');

// Get all user's SKRs
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const holdings = await GoldHolding.findByUserId(req.user.id, status);

    const formatted = holdings.map(h => ({
      id: h.id,
      skrReference: h.skr_reference,
      goldName: h.gold_name,
      purity: h.purity,
      quantity: h.quantity,
      weightGrams: parseFloat(h.weight_grams),
      purchasePricePerGram: parseFloat(h.purchase_price_per_gram),
      totalPaid: parseFloat(h.total_paid_usd),
      currentPricePerGram: parseFloat(h.current_price_per_gram || h.purchase_price_per_gram),
      currentValue: parseFloat(h.current_value_usd || h.total_paid_usd),
      profitLoss: parseFloat(h.profit_loss_usd || 0),
      profitLossPercentage: parseFloat(h.profit_loss_percentage || 0),
      paymentCurrency: h.payment_currency,
      paymentAmount: parseFloat(h.payment_amount),
      status: h.status,
      purchaseDate: h.purchase_date,
      sellDate: h.sell_date,
      holdingDays: h.holding_duration_days || 0
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get SKRs error:', error);
    res.status(500).json({ message: 'Failed to fetch SKRs' });
  }
});

// Get SKR by reference number
router.get('/:skrReference', async (req, res) => {
  try {
    const holding = await GoldHolding.findBySKR(req.params.skrReference);

    if (!holding) {
      return res.status(404).json({ message: 'SKR not found' });
    }

    // Verify ownership
    if (holding.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Calculate current profit
    const profitData = await GoldHolding.calculateProfit(req.params.skrReference);

    res.json({
      skrReference: holding.skr_reference,
      goldName: holding.gold_name,
      purity: holding.purity,
      quantity: holding.quantity,
      weightGrams: parseFloat(holding.weight_grams),
      purchaseDetails: {
        pricePerGram: parseFloat(holding.purchase_price_per_gram),
        totalPaid: parseFloat(holding.total_paid_usd),
        paymentCurrency: holding.payment_currency,
        paymentAmount: parseFloat(holding.payment_amount),
        purchaseDate: holding.purchase_date
      },
      currentDetails: {
        pricePerGram: parseFloat(profitData.current_price_per_gram),
        currentValue: parseFloat(profitData.current_value),
        marketPrice: parseFloat(holding.current_market_price)
      },
      profitLoss: {
        amount: parseFloat(profitData.profit_loss),
        percentage: parseFloat(profitData.profit_loss_percentage),
        daysHeld: profitData.days_held
      },
      status: holding.status,
      sellDate: holding.sell_date
    });
  } catch (error) {
    console.error('Get SKR error:', error);
    res.status(500).json({ message: 'Failed to fetch SKR details' });
  }
});

// Sell gold back to platform
router.post('/:id/sell', async (req, res) => {
  try {
    const result = await GoldHolding.sellGold(req.params.id, req.user.id);

    res.json({
      message: 'Gold sold successfully!',
      soldPrice: parseFloat(result.soldPrice),
      profitLoss: parseFloat(result.profitLoss),
      skrReference: result.skrReference,
      creditedToWallet: true
    });
  } catch (error) {
    console.error('Sell gold error:', error);
    res.status(400).json({ message: error.message || 'Failed to sell gold' });
  }
});

// Withdraw profit only
router.post('/:id/withdraw-profit', async (req, res) => {
  try {
    const result = await GoldHolding.withdrawProfit(req.params.id, req.user.id);

    res.json({
      message: 'Profit withdrawn successfully!',
      profitWithdrawn: parseFloat(result.profitWithdrawn),
      skrReference: result.skrReference,
      creditedToWallet: true
    });
  } catch (error) {
    console.error('Withdraw profit error:', error);
    res.status(400).json({ message: error.message || 'Failed to withdraw profit' });
  }
});

// Toggle SKR checkbox status (for dashboard interactions)
router.post('/:id/toggle', async (req, res) => {
  try {
    const { checked } = req.body;
    
    // Update the holding's status or add a custom field for UI state
    const result = await query(
      `UPDATE gold_holdings 
       SET status = CASE 
         WHEN $2 = true THEN 'selected'
         ELSE 'holding'
       END
       WHERE id = $1 AND user_id = $3
       RETURNING *`,
      [req.params.id, checked, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'SKR not found' });
    }

    res.json({
      message: 'SKR status updated',
      id: req.params.id,
      checked,
      status: result.rows[0].status
    });
  } catch (error) {
    console.error('Toggle SKR error:', error);
    res.status(500).json({ message: 'Failed to update SKR status' });
  }
});

// Get dashboard summary data
router.get('/dashboard/summary', async (req, res) => {
  try {
    const holdings = await GoldHolding.findByUserId(req.user.id);
    
    const summary = {
      totalHoldings: holdings.length,
      totalWeight: holdings.reduce((sum, h) => sum + parseFloat(h.weight_grams), 0),
      totalPaid: holdings.reduce((sum, h) => sum + parseFloat(h.total_paid_usd), 0),
      currentValue: holdings.reduce((sum, h) => sum + parseFloat(h.current_value_usd || h.total_paid_usd), 0),
      totalProfit: holdings.reduce((sum, h) => sum + parseFloat(h.profit_loss_usd || 0), 0),
      activeHoldings: holdings.filter(h => h.status === 'holding').length,
      soldHoldings: holdings.filter(h => h.status === 'sold').length
    };

    res.json(summary);
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard summary' });
  }
});

module.exports = router;


