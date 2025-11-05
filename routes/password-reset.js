const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/database');
const emailService = require('../services/emailService');

/**
 * Request password reset
 * POST /api/password-reset/request
 */
router.post('/request', async (req, res) => {
  try {
    const { email, twoFactorCode } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user exists
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Don't reveal that user doesn't exist (security best practice)
      return res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }

    const user = result.rows[0];

    // Check if user has 2FA enabled
    const has2FA = user.two_factor_enabled && user.totp_secret;
    
    // If 2FA is enabled, require TOTP token
    if (has2FA) {
      if (!twoFactorCode) {
        // 2FA is enabled but code is missing
        return res.json({
          requiresTwoFactor: true,
          message: 'Two-factor authentication is enabled for this account. Please enter the 6-digit code from your authenticator app.'
        });
      }

      // Verify TOTP token
      const TOTPService = require('../services/totpService');
      const isValidToken = TOTPService.verifyToken(user.totp_secret, twoFactorCode);
      
      if (!isValidToken) {
        return res.status(401).json({ 
          message: 'Invalid verification code. Please try again.',
          requiresTwoFactor: true
        });
      }
      
      // 2FA verified successfully - return verified status to show password reset form
      return res.json({
        verified: true,
        message: 'Verification successful. You can now reset your password.'
      });
    }

    // If no 2FA, user doesn't exist or 2FA is not enabled
    // Don't reveal that user doesn't exist (security best practice)
    return res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    console.error('Error details:', error.message, error.stack);
    
    // Provide more detailed error message for debugging (in development)
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Failed to process password reset request: ${error.message}`
      : 'Failed to process password reset request';
    
    res.status(500).json({ message: errorMessage });
  }
});

/**
 * Verify reset token
 * GET /api/password-reset/verify/:token
 */
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: 'Reset token is required' });
    }

    // Hash the token to compare with database
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const result = await query(
      `SELECT id, email, full_name 
       FROM users 
       WHERE reset_token = $1 
       AND reset_token_expiry > NOW()`,
      [resetTokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token',
        valid: false 
      });
    }

    res.json({ 
      valid: true,
      email: result.rows[0].email,
      message: 'Token is valid' 
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ message: 'Failed to verify reset token' });
  }
});

/**
 * Reset password directly after 2FA verification
 * POST /api/password-reset/reset-direct
 */
router.post('/reset-direct', async (req, res) => {
  try {
    const { email, twoFactorCode, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user exists
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Don't reveal that user doesn't exist (security best practice)
      return res.status(400).json({ message: 'Invalid request' });
    }

    const user = result.rows[0];

    // Verify 2FA is enabled and code is provided
    const has2FA = user.two_factor_enabled && user.totp_secret;
    
    if (!has2FA) {
      return res.status(400).json({ message: 'Two-factor authentication is required for this operation' });
    }

    if (!twoFactorCode) {
      return res.status(400).json({ 
        message: 'Verification code is required',
        requiresTwoFactor: true
      });
    }

    // Verify TOTP token
    const TOTPService = require('../services/totpService');
    const isValidToken = TOTPService.verifyToken(user.totp_secret, twoFactorCode);
    
    if (!isValidToken) {
      return res.status(401).json({ 
        message: 'Invalid verification code. Please try again.',
        requiresTwoFactor: true
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await query(
      `UPDATE users 
       SET password_hash = $1, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    // Log the password reset
    await query(
      `INSERT INTO audit_log (user_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        'password_reset',
        { email: user.email, method: 'direct_2fa' },
        req.ip || '::1',
        req.headers['user-agent'] || 'Unknown'
      ]
    );

    res.json({ 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Direct password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

/**
 * Reset password (using token from email)
 * POST /api/password-reset/reset
 */
router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Hash the token to compare with database
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const result = await query(
      `SELECT id, email, full_name 
       FROM users 
       WHERE reset_token = $1 
       AND reset_token_expiry > NOW()`,
      [resetTokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await query(
      `UPDATE users 
       SET password_hash = $1, 
           reset_token = NULL, 
           reset_token_expiry = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    // Log the password reset
    await query(
      `INSERT INTO audit_log (user_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        'password_reset',
        { email: user.email },
        req.ip || '::1',
        req.headers['user-agent'] || 'Unknown'
      ]
    );

    res.json({ 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

module.exports = router;


