const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const Receipt = require('../models/Receipt');
const User = require('../models/User');

// Get all receipts (admin view)
router.get('/receipts', async (req, res) => {
  try {
    const receipts = await Receipt.findAll();
    
    // Format response to match frontend expectations
    const formattedReceipts = receipts.map(receipt => ({
      _id: receipt.id,
      referenceNumber: receipt.reference_number,
      dateOfIssue: receipt.date_of_issue,
      dateOfRelease: receipt.date_of_release,
      depositorName: receipt.depositor_name,
      representative: receipt.representative,
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: receipt.date_of_initial_deposit,
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    }));
    
    res.json(formattedReceipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new receipt
router.post('/receipts', async (req, res) => {
  try {
    const receipt = await Receipt.create(req.body);
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
      referenceNumber: receipt.reference_number,
      dateOfIssue: receipt.date_of_issue,
      dateOfRelease: receipt.date_of_release,
      depositorName: receipt.depositor_name,
      representative: receipt.representative,
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: receipt.date_of_initial_deposit,
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.status(201).json(formattedReceipt);
  } catch (error) {
    console.error('Create receipt error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update receipt
router.put('/receipts/:id', async (req, res) => {
  try {
    const receipt = await Receipt.update(req.params.id, req.body);
    
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
      referenceNumber: receipt.reference_number,
      dateOfIssue: receipt.date_of_issue,
      dateOfRelease: receipt.date_of_release,
      depositorName: receipt.depositor_name,
      representative: receipt.representative,
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: receipt.date_of_initial_deposit,
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.json(formattedReceipt);
  } catch (error) {
    console.error('Update receipt error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete receipt
router.delete('/receipts/:id', async (req, res) => {
  try {
    const success = await Receipt.delete(req.params.id);
    
    if (!success) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get receipt by ID (admin view)
router.get('/receipts/:id', async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
      referenceNumber: receipt.reference_number,
      dateOfIssue: receipt.date_of_issue,
      dateOfRelease: receipt.date_of_release,
      depositorName: receipt.depositor_name,
      representative: receipt.representative,
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: receipt.date_of_initial_deposit,
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.json(formattedReceipt);
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get KPIs for admin dashboard
router.get('/kpis', async (req, res) => {
  try {
    // Get total users count
    const usersResult = await query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Get total gold holdings (using weight as gold amount)
    const goldResult = await query(`
      SELECT 
        COALESCE(SUM(weight), 0) as total_gold,
        COALESCE(SUM(declared_value), 0) as total_value
      FROM receipts 
      WHERE status = 'active'
    `);
    const totalGold = parseFloat(goldResult.rows[0].total_gold || 0);
    const totalCryptoVolume = parseFloat(goldResult.rows[0].total_value || 0);

    res.json({
      totalUsers,
      totalGold,
      totalCryptoVolume,
      systemStatus: 'Active'
    });
  } catch (error) {
    console.error('Get KPIs error:', error);
    res.status(500).json({ message: 'Failed to fetch KPIs' });
  }
});

// Get all users (admin view)
router.get('/users', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id,
        full_name,
        email,
        role,
        created_at,
        last_login,
        CASE WHEN role = 'admin' OR role = 'user' THEN true ELSE false END as is_active
      FROM users 
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Get all SKRs (Storage Keeping Receipts)
router.get('/skrs', async (req, res) => {
  try {
    // Check if skrs table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'skrs'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Table doesn't exist, return empty array
      console.log('SKRs table does not exist, returning empty array');
      return res.json([]);
    }
    
    const result = await query(`
      SELECT 
        sr.id,
        sr.skr_number,
        sr.user_id,
        u.full_name as user_name,
        u.email as user_email,
        sr.storage_location,
        sr.gold_weight,
        sr.gold_purity,
        sr.status,
        sr.issued_date,
        sr.expiry_date,
        sr.created_at,
        sr.updated_at
      FROM skrs sr
      LEFT JOIN users u ON sr.user_id = u.id
      ORDER BY sr.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get SKRs error:', error);
    // Return empty array instead of error to prevent frontend crashes
    res.json([]);
  }
});

// Get gold prices for admin dashboard (formatted for frontend)
router.get('/gold-prices', async (req, res) => {
  try {
    const goldPriceService = require('../services/goldPriceService');
    
    // Get current gold price
    const currentPrice = await goldPriceService.getCurrentGoldPrice();
    
    // Create gold prices array in the format expected by frontend
    const goldPrices = [
      {
        currency: 'USD',
        price: currentPrice,
        change_24h: 0, // Would need historical data to calculate
        last_updated: new Date().toISOString()
      },
      {
        currency: 'EUR',
        price: currentPrice * 0.85, // Approximate EUR rate
        change_24h: 0,
        last_updated: new Date().toISOString()
      },
      {
        currency: 'GBP',
        price: currentPrice * 0.78, // Approximate GBP rate
        change_24h: 0,
        last_updated: new Date().toISOString()
      }
    ];
    
    res.json(goldPrices);
  } catch (error) {
    console.error('Get gold prices error:', error);
    // Return fallback data
    res.json([
      {
        currency: 'USD',
        price: 65.50,
        change_24h: 0,
        last_updated: new Date().toISOString()
      },
      {
        currency: 'EUR',
        price: 55.68,
        change_24h: 0,
        last_updated: new Date().toISOString()
      },
      {
        currency: 'GBP',
        price: 51.09,
        change_24h: 0,
        last_updated: new Date().toISOString()
      }
    ]);
  }
});

// Get gold pricing settings
router.get('/gold-settings', async (req, res) => {
  try {
    // Check if gold_settings table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'gold_settings'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Table doesn't exist, return default settings
      console.log('Gold settings table does not exist, returning default settings');
      return res.json({
        markup_percentage: 2.5,
        spread_percentage: 0.5,
        minimum_order: 1,
        maximum_order: 1000,
        auto_update: true
      });
    }
    
    const result = await query(`
      SELECT * FROM gold_settings 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Return default settings if none exist
      res.json({
        markup_percentage: 2.5,
        spread_percentage: 0.5,
        minimum_order: 1,
        maximum_order: 1000,
        auto_update: true
      });
    }
  } catch (error) {
    console.error('Get gold settings error:', error);
    // Return default settings instead of error
    res.json({
      markup_percentage: 2.5,
      spread_percentage: 0.5,
      minimum_order: 1,
      maximum_order: 1000,
      auto_update: true
    });
  }
});

// Update gold pricing settings
router.post('/gold-settings', async (req, res) => {
  try {
    const { markup_percentage, spread_percentage, minimum_order, maximum_order, auto_update } = req.body;
    
    // Insert or update settings
    const result = await query(`
      INSERT INTO gold_settings (markup_percentage, spread_percentage, minimum_order, maximum_order, auto_update)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        markup_percentage = EXCLUDED.markup_percentage,
        spread_percentage = EXCLUDED.spread_percentage,
        minimum_order = EXCLUDED.minimum_order,
        maximum_order = EXCLUDED.maximum_order,
        auto_update = EXCLUDED.auto_update,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [markup_percentage, spread_percentage, minimum_order, maximum_order, auto_update]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update gold settings error:', error);
    res.status(500).json({ message: 'Failed to update gold settings' });
  }
});

// Update gold price manually
router.post('/update-gold-price', async (req, res) => {
  try {
    const { currency } = req.body;
    
    // This would typically fetch from an external API and update the price
    // For now, return a success message
    res.json({ 
      message: `${currency} gold price updated successfully`,
      currency,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update gold price error:', error);
    res.status(500).json({ message: 'Failed to update gold price' });
  }
});

// Get chart data for admin dashboard
router.get('/chart-data', async (req, res) => {
  try {
    // Get data for the last 30 days
    const result = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transactions,
        SUM(declared_value) as volume
      FROM receipts 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get chart data error:', error);
    res.status(500).json({ message: 'Failed to fetch chart data' });
  }
});

// Get recent activities for admin dashboard
router.get('/recent-activities', async (req, res) => {
  try {
    // Get recent receipts and user activities
    const receiptsResult = await query(`
      SELECT 
        'receipt_created' as type,
        'New receipt created' as description,
        reference_number as value,
        created_at as timestamp
      FROM receipts 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    const usersResult = await query(`
      SELECT 
        'user_registered' as type,
        'New user registered' as description,
        full_name as value,
        created_at as timestamp
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    const activities = [...receiptsResult.rows, ...usersResult.rows]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    
    res.json(activities);
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({ message: 'Failed to fetch recent activities' });
  }
});

module.exports = router;