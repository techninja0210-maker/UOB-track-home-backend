const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Admin access required' });
  }
};

// Get all contracts (public)
router.get('/contracts', async (req, res) => {
  try {
    // First check if crowdfunding_contracts table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'crowdfunding_contracts'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Table doesn't exist, return empty result
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    const { status, category, page = 1, limit = 10 } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND c.status = $${paramCount}`;
      params.push(status);
    }
    
    if (category && category !== 'all') {
      paramCount++;
      whereClause += ` AND c.contract_type = $${paramCount}`;
      params.push(category);
    }
    
    const offset = (page - 1) * limit;
    paramCount++;
    const limitParam = `$${paramCount}`;
    params.push(limit);
    
    paramCount++;
    const offsetParam = `$${paramCount}`;
    params.push(offset);
    
    // Auto-update status from 'upcoming' to 'ongoing' if start_date has passed
    await query(`
      UPDATE crowdfunding_contracts 
      SET status = 'ongoing', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'upcoming' 
      AND start_date IS NOT NULL 
      AND start_date <= CURRENT_TIMESTAMP
    `);

    const result = await query(`
      SELECT 
        c.*,
        u.full_name as created_by_name,
        COUNT(i.id) as total_investors,
        CASE 
          WHEN c.target_amount > 0 THEN (c.current_amount / c.target_amount * 100)
          ELSE 0 
        END as progress_percentage
      FROM crowdfunding_contracts c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN crowdfunding_investments i ON c.id = i.contract_id AND i.status = 'confirmed'
      ${whereClause}
      GROUP BY c.id, u.full_name
      ORDER BY c.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, params);
    
    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM crowdfunding_contracts c
      ${whereClause}
    `, params.slice(0, -2)); // Remove limit and offset params
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get contracts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get single contract details
router.get('/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT 
        c.*,
        u.full_name as created_by_name,
        COUNT(i.id) as total_investors,
        CASE 
          WHEN c.target_amount > 0 THEN (c.current_amount / c.target_amount * 100)
          ELSE 0 
        END as progress_percentage
      FROM crowdfunding_contracts c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN crowdfunding_investments i ON c.id = i.contract_id AND i.status = 'confirmed'
      WHERE c.id = $1
      GROUP BY c.id, u.full_name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Contract not found' 
      });
    }
    
    // Get recent investments
    const investmentsResult = await query(`
      SELECT 
        i.*,
        u.full_name as investor_name,
        u.email as investor_email
      FROM crowdfunding_investments i
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.contract_id = $1 AND i.status = 'confirmed'
      ORDER BY i.created_at DESC
      LIMIT 10
    `, [id]);
    
    // Get project updates (optional - table might not exist)
    let updatesResult = { rows: [] };
    try {
      updatesResult = await query(`
        SELECT 
          u.*,
          usr.full_name as author_name
        FROM crowdfunding_updates u
        LEFT JOIN users usr ON u.created_by = usr.id
        WHERE u.contract_id = $1 AND u.is_public = true
        ORDER BY u.created_at DESC
        LIMIT 5
      `, [id]);
    } catch (updateError) {
      // Table doesn't exist or other error - continue without updates
      console.log('Updates table not available:', updateError.message);
    }
    
    res.json({
      success: true,
      data: {
        contract: result.rows[0],
        recent_investments: investmentsResult.rows,
        updates: updatesResult.rows
      }
    });
  } catch (error) {
    console.error('Get contract details error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Create new contract (admin only)
router.post('/contracts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First check if crowdfunding_contracts table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'crowdfunding_contracts'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(500).json({
        success: false,
        message: 'Crowdfunding tables not set up. Please contact administrator.'
      });
    }
    
    const {
      title,
      description,
      target_amount,
      minimum_investment,
      maximum_investment,
      currency,
      start_date,
      end_date,
      contract_type,
      profit_percentage,
      contract_duration_months
    } = req.body;
    
    
    // Validate required fields
    if (!title || !description || !target_amount) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and target amount are required'
      });
    }
    
    const result = await query(`
      INSERT INTO crowdfunding_contracts (
        title, description, target_amount, minimum_investment, maximum_investment,
        currency, start_date, end_date, contract_type, profit_percentage,
        contract_duration_months, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      title, description, target_amount, minimum_investment || 100, maximum_investment,
      currency || 'USDT', 
      start_date && start_date !== '' ? start_date : null, 
      end_date && end_date !== '' ? end_date : null, 
      contract_type || 'gold', 
      profit_percentage || 1.00, contract_duration_months || 12, req.user.id
    ]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Contract created successfully'
    });
  } catch (error) {
    console.error('Create contract error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update contract (admin only)
router.put('/contracts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      target_amount,
      minimum_investment,
      maximum_investment,
      currency,
      start_date,
      end_date,
      image_url,
      category,
      risk_level,
      expected_return,
      contract_type,
      status
    } = req.body;
    
    const result = await query(`
      UPDATE crowdfunding_contracts SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        target_amount = COALESCE($3, target_amount),
        minimum_investment = COALESCE($4, minimum_investment),
        maximum_investment = COALESCE($5, maximum_investment),
        currency = COALESCE($6, currency),
        start_date = COALESCE($7, start_date),
        end_date = COALESCE($8, end_date),
        image_url = COALESCE($9, image_url),
        category = COALESCE($10, category),
        risk_level = COALESCE($11, risk_level),
        expected_return = COALESCE($12, expected_return),
        contract_type = COALESCE($13, contract_type),
        status = COALESCE($14, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      title, description, target_amount, minimum_investment, maximum_investment,
      currency, 
      start_date && start_date !== '' ? start_date : null, 
      end_date && end_date !== '' ? end_date : null, 
      image_url, category, risk_level,
      expected_return, contract_type, status, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contract not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Contract updated successfully'
    });
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Delete contract (admin only)
router.delete('/contracts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if contract has any confirmed investments
    const investmentsResult = await query(`
      SELECT COUNT(*) as count
      FROM crowdfunding_investments
      WHERE contract_id = $1 AND status = 'confirmed'
    `, [id]);
    
    if (parseInt(investmentsResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete contract with confirmed investments'
      });
    }
    
    const result = await query(`
      DELETE FROM crowdfunding_contracts
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contract not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Contract deleted successfully'
    });
  } catch (error) {
    console.error('Delete contract error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Make investment using wallet balance
router.post('/invest', authenticateToken, async (req, res) => {
  try {
    const { contract_id, amount } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!contract_id || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Contract ID and amount are required'
      });
    }
    
    const investmentAmount = parseFloat(amount);
    
    // Get contract details
    const contractResult = await query(`
      SELECT * FROM crowdfunding_contracts WHERE id = $1
    `, [contract_id]);
    
    if (contractResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contract not found'
      });
    }
    
    const contract = contractResult.rows[0];
    
    // Check if contract is accepting investments
    if (contract.status !== 'ongoing') {
      return res.status(400).json({
        success: false,
        message: 'Contract is not currently accepting investments'
      });
    }
    
    // Check minimum investment ($100)
    if (investmentAmount < contract.minimum_investment) {
      return res.status(400).json({
        success: false,
        message: `Minimum investment amount is $${contract.minimum_investment}`
      });
    }
    
    // Check user's wallet balance
    const balanceResult = await query(`
      SELECT balance FROM user_balances 
      WHERE user_id = $1 AND currency = $2
    `, [userId, contract.currency]);
    
    if (balanceResult.rows.length === 0 || parseFloat(balanceResult.rows[0].balance) < investmentAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }
    
    // Start transaction
    await query('BEGIN');
    
    try {
      // Deduct from user's wallet balance
      await query(`
        UPDATE user_balances 
        SET balance = balance - $1, available_balance = available_balance - $1
        WHERE user_id = $2 AND currency = $3
      `, [investmentAmount, userId, contract.currency]);
      
      // Create investment record
      const investmentResult = await query(`
        INSERT INTO crowdfunding_investments (
          contract_id, user_id, amount, currency, payment_method, status
        ) VALUES ($1, $2, $3, $4, 'wallet_balance', 'confirmed')
        RETURNING *
      `, [contract_id, userId, investmentAmount, contract.currency]);
      
      // Update contract current amount (this will trigger profit distribution if target is reached)
      await query(`
        UPDATE crowdfunding_contracts 
        SET current_amount = current_amount + $1
        WHERE id = $2
      `, [investmentAmount, contract_id]);
      
      await query('COMMIT');
      
      res.status(201).json({
        success: true,
        data: investmentResult.rows[0],
        message: 'Investment successful! Your funds have been invested in the contract.'
      });
      
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Make investment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Get user investments with profit calculations
router.get('/my-investments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await query(`
      SELECT 
        i.*,
        c.title as contract_title,
        c.description as contract_description,
        c.status as contract_status,
        c.target_amount,
        c.current_amount,
        c.end_date,
        c.contract_type,
        c.profit_percentage,
        c.is_target_reached,
        c.profit_distributed,
        CASE 
          WHEN c.target_amount > 0 THEN (c.current_amount / c.target_amount * 100)
          ELSE 0 
        END as progress_percentage,
        -- Calculate potential profit
        CASE 
          WHEN c.is_target_reached THEN i.profit_amount
          ELSE i.amount * (c.profit_percentage / 100)
        END as calculated_profit,
        -- Calculate total return (investment + profit)
        CASE 
          WHEN c.is_target_reached THEN i.amount + i.profit_amount
          ELSE i.amount + (i.amount * (c.profit_percentage / 100))
        END as total_return
      FROM crowdfunding_investments i
      LEFT JOIN crowdfunding_contracts c ON i.contract_id = c.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `, [userId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get user investments error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Get all investments for admin
router.get('/admin/investments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First check if crowdfunding_investments table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'crowdfunding_investments'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Table doesn't exist, return empty result
      return res.json({
        success: true,
        data: []
      });
    }
    
    const { contract_id, status, page = 1, limit = 20 } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (contract_id) {
      paramCount++;
      whereClause += ` AND i.contract_id = $${paramCount}`;
      params.push(contract_id);
    }
    
    if (status && status !== 'all') {
      paramCount++;
      whereClause += ` AND i.status = $${paramCount}`;
      params.push(status);
    }
    
    const offset = (page - 1) * limit;
    paramCount++;
    const limitParam = `$${paramCount}`;
    params.push(limit);
    
    paramCount++;
    const offsetParam = `$${paramCount}`;
    params.push(offset);
    
    const result = await query(`
      SELECT 
        i.*,
        u.full_name as investor_name,
        u.email as investor_email,
        c.title as contract_title
      FROM crowdfunding_investments i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN crowdfunding_contracts c ON i.contract_id = c.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get admin investments error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update investment status (admin only)
router.put('/admin/investments/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const result = await query(`
      UPDATE crowdfunding_investments SET
        status = $1,
        admin_notes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [status, admin_notes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Investment status updated successfully'
    });
  } catch (error) {
    console.error('Update investment status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// Pay profits to user wallets (admin only)
router.post('/admin/pay-profits/:contractId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { contractId } = req.params;
    
    // Get contract details
    const contractResult = await query(`
      SELECT * FROM crowdfunding_contracts WHERE id = $1
    `, [contractId]);
    
    if (contractResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contract not found'
      });
    }
    
    const contract = contractResult.rows[0];
    
    if (!contract.is_target_reached || !contract.profit_distributed) {
      return res.status(400).json({
        success: false,
        message: 'Contract target not reached or profits not distributed yet'
      });
    }
    
    // Get all investments with profits
    const investmentsResult = await query(`
      SELECT * FROM crowdfunding_investments 
      WHERE contract_id = $1 AND status = 'confirmed' AND profit_amount > 0 AND NOT profit_paid
    `, [contractId]);
    
    if (investmentsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unpaid profits found for this contract'
      });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each investment
    for (const investment of investmentsResult.rows) {
      try {
        await query('BEGIN');
        
        // Add profit to user's wallet balance
        await query(`
          INSERT INTO user_balances (user_id, currency, balance, available_balance)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (user_id, currency)
          DO UPDATE SET 
            balance = user_balances.balance + $3,
            available_balance = user_balances.available_balance + $3
        `, [investment.user_id, investment.currency, investment.profit_amount]);
        
        // Mark profit as paid
        await query(`
          UPDATE crowdfunding_investments 
          SET profit_paid = TRUE, profit_paid_date = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [investment.id]);
        
        await query('COMMIT');
        successCount++;
        
      } catch (error) {
        await query('ROLLBACK');
        errorCount++;
        errors.push(`Investment ${investment.id}: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Profits processed: ${successCount} successful, ${errorCount} failed`,
      data: {
        successful: successCount,
        failed: errorCount,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('Pay profits error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
