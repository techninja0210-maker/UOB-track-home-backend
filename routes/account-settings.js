const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const authRoutes = require('./auth');
const { authenticateToken, requireAdmin } = authRoutes;

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await query(
      'SELECT id, full_name, email, role, created_at, last_login FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = result.rows[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '', // Handle missing phone column
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        isEmailVerified: true, // Placeholder
        isPhoneVerified: false // Placeholder
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, phone } = req.body;
    
    // Check if phone column exists before updating
    try {
      await query(
        'UPDATE users SET full_name = $1, phone = $2, updated_at = NOW() WHERE id = $3',
        [fullName, phone, userId]
      );
    } catch (phoneError) {
      // If phone column doesn't exist, just update full_name
      if (phoneError.code === '42703') { // Column doesn't exist
        await query(
          'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2',
          [fullName, userId]
        );
      } else {
        throw phoneError;
      }
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Get user security settings
router.get('/security', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user security settings (placeholder implementation)
    const securitySettings = {
      twoFactorEnabled: false,
      loginNotifications: true,
      sessionTimeout: 30
    };
    
    res.json({
      success: true,
      data: securitySettings
    });
  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security settings'
    });
  }
});

// Update user security settings
router.put('/security', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { twoFactorEnabled, loginNotifications, sessionTimeout } = req.body;
    
    // Update user security settings (placeholder implementation)
    // In a real implementation, you would store these in the database
    
    res.json({
      success: true,
      message: 'Security settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings'
    });
  }
});

// Get user notification settings
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user notification settings (placeholder implementation)
    const notificationSettings = {
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      withdrawalAlerts: true,
      depositAlerts: true,
      priceAlerts: false
    };
    
    res.json({
      success: true,
      data: notificationSettings
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification settings'
    });
  }
});

// Update user notification settings
router.put('/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationSettings = req.body;
    
    // Update user notification settings (placeholder implementation)
    // In a real implementation, you would store these in the database
    
    res.json({
      success: true,
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings'
    });
  }
});

// Admin: Get system settings
router.get('/admin/system-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get system settings (placeholder implementation)
    const systemSettings = {
      maintenanceMode: false,
      registrationEnabled: true,
      withdrawalEnabled: true,
      depositEnabled: true,
      maxWithdrawalAmount: 10000,
      minWithdrawalAmount: 0.001,
      withdrawalFee: 0.5,
      sessionTimeout: 30
    };
    
    res.json({
      success: true,
      data: systemSettings
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings'
    });
  }
});

// Admin: Update system settings
router.put('/admin/system-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const systemSettings = req.body;
    
    // Update system settings (placeholder implementation)
    // In a real implementation, you would store these in a system_settings table
    
    console.log('System settings updated:', systemSettings);
    
    res.json({
      success: true,
      message: 'System settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings'
    });
  }
});

// Admin: Get security settings
router.get('/admin/security-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get security settings (placeholder implementation)
    const securitySettings = {
      twoFactorRequired: false,
      ipWhitelist: [],
      loginAttempts: 5,
      lockoutDuration: 15,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false
      }
    };
    
    res.json({
      success: true,
      data: securitySettings
    });
  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security settings'
    });
  }
});

// Admin: Update security settings
router.put('/admin/security-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const securitySettings = req.body;
    
    // Update security settings (placeholder implementation)
    // In a real implementation, you would store these in a security_settings table
    
    console.log('Security settings updated:', securitySettings);
    
    res.json({
      success: true,
      message: 'Security settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings'
    });
  }
});

module.exports = router;
