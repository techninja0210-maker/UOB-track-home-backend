const express = require('express');
const router = express.Router();
const auth = require('./auth');
const ReferralService = require('../services/referralService');
const { query } = require('../config/database');

// Get user's referral code
router.get('/my-code', auth.authenticateToken, async (req, res) => {
  try {
    const referralCode = await ReferralService.getUserReferralCode(req.user.id);
    res.json({ referralCode });
  } catch (error) {
    console.error('Get referral code error:', error);
    res.status(500).json({ message: 'Failed to get referral code' });
  }
});

// Get referral statistics for current user
router.get('/stats', auth.authenticateToken, async (req, res) => {
  try {
    const stats = await ReferralService.getReferralStats(req.user.id);
    
    // Also check if current user was referred by someone
    const referrerResult = await query(
      `SELECT 
         r.id,
         r.referral_code,
         r.created_at as referral_date,
         u.id as referrer_id,
         u.full_name as referrer_name,
         u.email as referrer_email
       FROM referrals r
       JOIN users u ON r.referrer_id = u.id
       WHERE r.referred_id = $1
       LIMIT 1`,
      [req.user.id]
    );
    
    res.json({
      ...stats,
      referredBy: referrerResult.rows[0] || null
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ message: 'Failed to get referral statistics' });
  }
});

// Get referral earnings history
router.get('/earnings', auth.authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get commissions
    const commissionsResult = await query(
      `SELECT 
         rc.*,
         u.full_name as referred_user_name,
         'commission' as type
       FROM referral_commissions rc 
       JOIN referrals r ON rc.referral_id = r.id 
       JOIN users u ON r.referred_id = u.id 
       WHERE r.referrer_id = $1 
       ORDER BY rc.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get bonuses
    const bonusesResult = await query(
      `SELECT 
         rb.*,
         u.full_name as referred_user_name,
         'bonus' as type
       FROM referral_bonuses rb 
       JOIN referrals r ON rb.referral_id = r.id 
       JOIN users u ON r.referred_id = u.id 
       WHERE r.referrer_id = $1 
       ORDER BY rb.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Combine and sort by date
    const allEarnings = [...commissionsResult.rows, ...bonusesResult.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      earnings: allEarnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allEarnings.length
      }
    });
  } catch (error) {
    console.error('Get referral earnings error:', error);
    res.status(500).json({ message: 'Failed to get referral earnings' });
  }
});

// Get referred users list
router.get('/referred-users', auth.authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         u.id,
         u.full_name,
         u.email,
         u.created_at as signup_date,
         r.status as referral_status,
         r.created_at as referral_date,
         COALESCE(re.total_earnings, 0) as total_earnings_from_user
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       LEFT JOIN referral_earnings re ON r.referred_id = re.user_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get referred users error:', error);
    res.status(500).json({ message: 'Failed to get referred users' });
  }
});

// Process referral during signup (public endpoint)
router.post('/process', async (req, res) => {
  try {
    const { referredUserId, referralCode } = req.body;

    if (!referredUserId || !referralCode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const referral = await ReferralService.processReferral(referredUserId, referralCode);
    res.json({ 
      message: 'Referral processed successfully',
      referral: {
        id: referral.id,
        referrerId: referral.referrer_id,
        referredId: referral.referred_id
      }
    });
  } catch (error) {
    console.error('Process referral error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Admin: Get all referrals
router.get('/admin/all', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const referrals = await ReferralService.getAllReferrals();
    res.json(referrals);
  } catch (error) {
    console.error('Get all referrals error:', error);
    res.status(500).json({ message: 'Failed to get all referrals' });
  }
});

// Admin: Get referral statistics
router.get('/admin/stats', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get total referrals
    const totalReferralsResult = await query('SELECT COUNT(*) as total FROM referrals');
    
    // Get active referrals
    const activeReferralsResult = await query(
      'SELECT COUNT(*) as active FROM referrals WHERE status = $1',
      ['active']
    );

    // Get total commissions paid
    const totalCommissionsResult = await query(
      'SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_commissions WHERE status = $1',
      ['paid']
    );

    // Get total bonuses paid
    const totalBonusesResult = await query(
      'SELECT COALESCE(SUM(bonus_amount), 0) as total FROM referral_bonuses WHERE status = $1',
      ['paid']
    );

    // Get top referrers
    const topReferrersResult = await query(
      `SELECT 
         u.full_name,
         u.email,
         COUNT(r.id) as referral_count,
         COALESCE(re.total_earnings, 0) as total_earnings
       FROM referrals r
       JOIN users u ON r.referrer_id = u.id
       LEFT JOIN referral_earnings re ON r.referrer_id = re.user_id
       GROUP BY u.id, u.full_name, u.email, re.total_earnings
       ORDER BY referral_count DESC
       LIMIT 10`
    );

    res.json({
      totalReferrals: parseInt(totalReferralsResult.rows[0].total),
      activeReferrals: parseInt(activeReferralsResult.rows[0].active),
      totalCommissionsPaid: parseFloat(totalCommissionsResult.rows[0].total),
      totalBonusesPaid: parseFloat(totalBonusesResult.rows[0].total),
      topReferrers: topReferrersResult.rows
    });
  } catch (error) {
    console.error('Get admin referral stats error:', error);
    res.status(500).json({ message: 'Failed to get admin referral statistics' });
  }
});

// Admin: Pay out pending earnings
router.post('/admin/payout/:userId', auth.authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { userId } = req.params;

    // Mark pending commissions as paid
    await query(
      'UPDATE referral_commissions SET status = $1, paid_at = NOW() WHERE referral_id IN (SELECT id FROM referrals WHERE referrer_id = $2) AND status = $3',
      ['paid', userId, 'pending']
    );

    // Mark pending bonuses as paid
    await query(
      'UPDATE referral_bonuses SET status = $1, paid_at = NOW() WHERE referral_id IN (SELECT id FROM referrals WHERE referrer_id = $2) AND status = $3',
      ['paid', userId, 'pending']
    );

    // Update earnings summary
    await ReferralService.updateEarningsSummary(userId);

    res.json({ message: 'Payout processed successfully' });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({ message: 'Failed to process payout' });
  }
});

module.exports = router;
