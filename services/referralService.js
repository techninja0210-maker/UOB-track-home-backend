const { query } = require('../config/database');

class ReferralService {
  // Generate unique referral code for a user
  static async generateReferralCode(userId) {
    try {
      // Check if user already has a referral code
      const existingCode = await query(
        'SELECT referral_code FROM user_referral_codes WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (existingCode.rows.length > 0) {
        return existingCode.rows[0].referral_code;
      }

      // Generate new referral code
      const referralCode = this.createReferralCode();
      
      // Ensure code is unique
      let isUnique = false;
      let attempts = 0;
      let finalCode = referralCode;

      while (!isUnique && attempts < 10) {
        const checkCode = await query(
          'SELECT id FROM user_referral_codes WHERE referral_code = $1',
          [finalCode]
        );

        if (checkCode.rows.length === 0) {
          isUnique = true;
        } else {
          finalCode = this.createReferralCode();
          attempts++;
        }
      }

      if (!isUnique) {
        throw new Error('Unable to generate unique referral code');
      }

      // Insert new referral code
      await query(
        'INSERT INTO user_referral_codes (user_id, referral_code) VALUES ($1, $2)',
        [userId, finalCode]
      );

      return finalCode;
    } catch (error) {
      console.error('Error generating referral code:', error);
      throw error;
    }
  }

  // Create referral code (format: REF + 8 random alphanumeric)
  static createReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'REF';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Process referral when user signs up
  static async processReferral(referredUserId, referralCode) {
    try {
      // Find referrer by code
      const referrerResult = await query(
        'SELECT user_id FROM user_referral_codes WHERE referral_code = $1 AND is_active = true',
        [referralCode]
      );

      if (referrerResult.rows.length === 0) {
        throw new Error('Invalid referral code');
      }

      const referrerId = referrerResult.rows[0].user_id;

      // Check if user was already referred
      const existingReferral = await query(
        'SELECT id FROM referrals WHERE referred_id = $1',
        [referredUserId]
      );

      if (existingReferral.rows.length > 0) {
        throw new Error('User already has a referrer');
      }

      // Create referral relationship
      const referralResult = await query(
        'INSERT INTO referrals (referrer_id, referred_id, referral_code) VALUES ($1, $2, $3) RETURNING *',
        [referrerId, referredUserId, referralCode]
      );

      // Award signup bonus to referrer
      await this.awardSignupBonus(referralResult.rows[0].id, referrerId);

      // Initialize earnings summary for referrer if not exists
      await this.initializeEarningsSummary(referrerId);

      return referralResult.rows[0];
    } catch (error) {
      console.error('Error processing referral:', error);
      throw error;
    }
  }

  // Award signup bonus to referrer
  static async awardSignupBonus(referralId, referrerId) {
    try {
      const signupBonusAmount = 10.00; // $10 signup bonus

      await query(
        'INSERT INTO referral_bonuses (referral_id, bonus_type, bonus_amount, description) VALUES ($1, $2, $3, $4)',
        [referralId, 'signup', signupBonusAmount, 'Signup bonus for referring a new user']
      );

      // Update earnings summary
      await this.updateEarningsSummary(referrerId);
    } catch (error) {
      console.error('Error awarding signup bonus:', error);
      throw error;
    }
  }

  // Process commission from transaction
  static async processTransactionCommission(transactionId, userId, transactionType, amount, currency) {
    try {
      // Find referral relationship
      const referralResult = await query(
        'SELECT r.id, r.referrer_id FROM referrals r WHERE r.referred_id = $1 AND r.status = $2',
        [userId, 'active']
      );

      if (referralResult.rows.length === 0) {
        return; // No referral relationship
      }

      const referralId = referralResult.rows[0].id;
      const referrerId = referralResult.rows[0].referrer_id;

      // Calculate commission (2.5% of transaction amount)
      const commissionRate = 0.025;
      const commissionAmount = amount * commissionRate;

      // Insert commission record
      await query(
        'INSERT INTO referral_commissions (referral_id, transaction_id, transaction_type, transaction_amount, commission_rate, commission_amount, currency) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [referralId, transactionId, transactionType, amount, commissionRate, commissionAmount, currency]
      );

      // Update earnings summary
      await this.updateEarningsSummary(referrerId);
    } catch (error) {
      console.error('Error processing transaction commission:', error);
      throw error;
    }
  }

  // Update earnings summary for a user
  static async updateEarningsSummary(userId) {
    try {
      // Calculate total commissions
      const commissionsResult = await query(
        'SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_commissions rc JOIN referrals r ON rc.referral_id = r.id WHERE r.referrer_id = $1',
        [userId]
      );

      // Calculate total bonuses
      const bonusesResult = await query(
        'SELECT COALESCE(SUM(bonus_amount), 0) as total FROM referral_bonuses rb JOIN referrals r ON rb.referral_id = r.id WHERE r.referrer_id = $1',
        [userId]
      );

      // Calculate paid earnings
      const paidCommissionsResult = await query(
        'SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_commissions rc JOIN referrals r ON rc.referral_id = r.id WHERE r.referrer_id = $1 AND rc.status = $2',
        [userId, 'paid']
      );

      const paidBonusesResult = await query(
        'SELECT COALESCE(SUM(bonus_amount), 0) as total FROM referral_bonuses rb JOIN referrals r ON rb.referral_id = r.id WHERE r.referrer_id = $1 AND rb.status = $2',
        [userId, 'paid']
      );

      const totalCommissions = parseFloat(commissionsResult.rows[0].total);
      const totalBonuses = parseFloat(bonusesResult.rows[0].total);
      const totalEarnings = totalCommissions + totalBonuses;
      const paidEarnings = parseFloat(paidCommissionsResult.rows[0].total) + parseFloat(paidBonusesResult.rows[0].total);
      const pendingEarnings = totalEarnings - paidEarnings;

      // Update or insert earnings summary
      await query(
        `INSERT INTO referral_earnings (user_id, total_commissions, total_bonuses, total_earnings, paid_earnings, pending_earnings, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           total_commissions = $2,
           total_bonuses = $3,
           total_earnings = $4,
           paid_earnings = $5,
           pending_earnings = $6,
           last_updated = NOW()`,
        [userId, totalCommissions, totalBonuses, totalEarnings, paidEarnings, pendingEarnings]
      );
    } catch (error) {
      console.error('Error updating earnings summary:', error);
      throw error;
    }
  }

  // Initialize earnings summary for new referrer
  static async initializeEarningsSummary(userId) {
    try {
      await query(
        'INSERT INTO referral_earnings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [userId]
      );
    } catch (error) {
      console.error('Error initializing earnings summary:', error);
      throw error;
    }
  }

  // Get referral statistics for a user
  static async getReferralStats(userId) {
    try {
      // Get total referrals
      const referralsResult = await query(
        'SELECT COUNT(*) as total_referrals FROM referrals WHERE referrer_id = $1',
        [userId]
      );

      // Get active referrals
      const activeReferralsResult = await query(
        'SELECT COUNT(*) as active_referrals FROM referrals WHERE referrer_id = $1 AND status = $2',
        [userId, 'active']
      );

      // Get earnings summary
      const earningsResult = await query(
        'SELECT * FROM referral_earnings WHERE user_id = $1',
        [userId]
      );

      // Get recent commissions
      const recentCommissionsResult = await query(
        `SELECT rc.*, u.full_name as referred_user_name 
         FROM referral_commissions rc 
         JOIN referrals r ON rc.referral_id = r.id 
         JOIN users u ON r.referred_id = u.id 
         WHERE r.referrer_id = $1 
         ORDER BY rc.created_at DESC 
         LIMIT 10`,
        [userId]
      );

      // Get recent bonuses
      const recentBonusesResult = await query(
        `SELECT rb.*, u.full_name as referred_user_name 
         FROM referral_bonuses rb 
         JOIN referrals r ON rb.referral_id = r.id 
         JOIN users u ON r.referred_id = u.id 
         WHERE r.referrer_id = $1 
         ORDER BY rb.created_at DESC 
         LIMIT 10`,
        [userId]
      );

      return {
        totalReferrals: parseInt(referralsResult.rows[0].total_referrals),
        activeReferrals: parseInt(activeReferralsResult.rows[0].active_referrals),
        earnings: earningsResult.rows[0] || {
          total_commissions: 0,
          total_bonuses: 0,
          total_earnings: 0,
          paid_earnings: 0,
          pending_earnings: 0
        },
        recentCommissions: recentCommissionsResult.rows,
        recentBonuses: recentBonusesResult.rows
      };
    } catch (error) {
      console.error('Error getting referral stats:', error);
      throw error;
    }
  }

  // Get user's referral code
  static async getUserReferralCode(userId) {
    try {
      const result = await query(
        'SELECT referral_code FROM user_referral_codes WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (result.rows.length === 0) {
        // Generate new referral code if none exists
        return await this.generateReferralCode(userId);
      }

      return result.rows[0].referral_code;
    } catch (error) {
      console.error('Error getting user referral code:', error);
      throw error;
    }
  }

  // Get all referrals for a user (admin view)
  static async getAllReferrals() {
    try {
      const result = await query(
        `SELECT 
           r.id,
           r.referral_code,
           r.status,
           r.created_at,
           referrer.full_name as referrer_name,
           referrer.email as referrer_email,
           referred.full_name as referred_name,
           referred.email as referred_email,
           re.total_earnings,
           re.pending_earnings
         FROM referrals r
         JOIN users referrer ON r.referrer_id = referrer.id
         JOIN users referred ON r.referred_id = referred.id
         LEFT JOIN referral_earnings re ON r.referrer_id = re.user_id
         ORDER BY r.created_at DESC`
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting all referrals:', error);
      throw error;
    }
  }
}

module.exports = ReferralService;
