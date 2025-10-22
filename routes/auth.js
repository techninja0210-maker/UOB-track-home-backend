const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LoginTrackingService = require('../services/loginTrackingService');
const GeoRestrictionService = require('../services/geoRestrictionService');
const { query } = require('../config/database');

// Register new user
router.post('/signup', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Validation
        if (!fullName || !email || !password) {
            return res.status(400).json({ 
                message: 'Full name, email, and password are required' 
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                message: 'Please provide a valid email address' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Check geographic restrictions and VPN detection
        const locationValidation = await GeoRestrictionService.validateUserLocation(req);
        if (!locationValidation.success) {
            // Log the restricted attempt
            await GeoRestrictionService.logRestrictedAttempt(req, email, locationValidation);
            
            // Determine error type
            const errorType = locationValidation.vpnResult && (locationValidation.vpnResult.isVPN || locationValidation.vpnResult.isUSVPN) 
                ? 'VPN_DETECTED' 
                : 'GEOGRAPHIC_RESTRICTION';
            
            return res.status(403).json({
                success: false,
                error: errorType,
                message: locationValidation.error.message,
                details: locationValidation.error.details,
                title: locationValidation.error.title,
                supportEmail: locationValidation.error.supportEmail,
                location: {
                    country: locationValidation.location?.country,
                    city: locationValidation.location?.city
                },
                vpnInfo: locationValidation.vpnResult ? {
                    provider: locationValidation.vpnResult.provider,
                    confidence: locationValidation.vpnResult.confidence,
                    isUSVPN: locationValidation.vpnResult.isUSVPN
                } : null
            });
        }

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ 
                message: 'An account with this email already exists' 
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Check for admin code (for initial admin setup)
        const { adminCode } = req.body;
        const isAdmin = adminCode === process.env.ADMIN_SETUP_CODE || adminCode === 'ADMIN_SETUP_2024';
        
        // Create new user
        const newUser = await User.create({
            fullName: fullName.trim(),
            email: email.trim(),
            passwordHash: hashedPassword,
            role: isAdmin ? 'admin' : 'user'
        });

        res.status(201).json({
            message: 'Account created successfully',
            user: {
                id: newUser.id,
                fullName: newUser.full_name,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            message: 'Internal server error during account creation' 
        });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password, keepSignedIn } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Email and password are required' 
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                message: 'Please provide a valid email address' 
            });
        }

        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            // Log failed login attempt
            await LoginTrackingService.logFailedLogin(email, req, 'User not found');
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            // Log failed login attempt
            await LoginTrackingService.logFailedLogin(email, req, 'Invalid password');
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        // Update last login
        await User.updateLastLogin(user.id);

        // Generate JWT token
        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            fullName: user.full_name
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'your-secret-key', {
            expiresIn: keepSignedIn ? '30d' : '24h'
        });

        // Log successful login with IP tracking
        await LoginTrackingService.logSuccessfulLogin(user.id, user.email, req, token);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            },
            keepSignedIn
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Internal server error during login' 
        });
    }
});

// Verify token
router.get('/verify', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid token' 
            });
        }

        res.json({
            valid: true,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ 
            message: 'Invalid or expired token' 
        });
    }
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
    res.json({ 
        message: 'Logout successful' 
    });
});

// Get current user info (alias for /profile)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }

        res.json({
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            role: user.role,
            createdAt: user.created_at,
            lastLogin: user.last_login
        });

    } catch (error) {
        console.error('User info error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }

        res.json({
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            role: user.role,
            createdAt: user.created_at,
            lastLogin: user.last_login
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, email } = req.body;
        
        // Validate email if provided
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ 
                message: 'Please provide a valid email address' 
            });
        }

        // Check if email is already taken by another user
        if (email) {
            const existingUser = await User.findByEmail(email);
            if (existingUser && existingUser.id !== req.user.id) {
                return res.status(409).json({ 
                    message: 'Email is already taken' 
                });
            }
        }

        // Update user
        const updatedUser = await User.update(req.user.id, { fullName, email });

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                fullName: updatedUser.full_name,
                email: updatedUser.email,
                role: updatedUser.role
            }
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Get user login history
router.get('/login-history', authenticateToken, async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const loginHistory = await LoginTrackingService.getUserLoginHistory(req.user.id, parseInt(limit));
        
        res.json({
            success: true,
            data: loginHistory
        });
    } catch (error) {
        console.error('Get login history error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Admin: Get suspicious login activity
router.get('/admin/suspicious-activity', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        const suspiciousActivity = await LoginTrackingService.getSuspiciousActivity(parseInt(hours));
        
        res.json({
            success: true,
            data: suspiciousActivity
        });
    } catch (error) {
        console.error('Get suspicious activity error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Admin: Get login statistics
router.get('/admin/login-statistics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const statistics = await LoginTrackingService.getLoginStatistics(parseInt(days));
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Get login statistics error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Admin: Get geographic restrictions
router.get('/admin/geo-restrictions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                restrictedCountries: GeoRestrictionService.getRestrictedCountries(),
                restrictedRegions: GeoRestrictionService.getRestrictedRegions()
            }
        });
    } catch (error) {
        console.error('Get geo restrictions error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Admin: Update geographic restrictions
router.put('/admin/geo-restrictions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { restrictedCountries, restrictedRegions } = req.body;
        
        if (restrictedCountries) {
            GeoRestrictionService.updateRestrictedCountries(restrictedCountries);
        }
        
        if (restrictedRegions) {
            GeoRestrictionService.updateRestrictedRegions(restrictedRegions);
        }
        
        res.json({
            success: true,
            message: 'Geographic restrictions updated successfully',
            data: {
                restrictedCountries: GeoRestrictionService.getRestrictedCountries(),
                restrictedRegions: GeoRestrictionService.getRestrictedRegions()
            }
        });
    } catch (error) {
        console.error('Update geo restrictions error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Check user location (for frontend warning)
router.post('/check-location', async (req, res) => {
    try {
        const locationValidation = await GeoRestrictionService.validateUserLocation(req);
        
        res.json({
            success: locationValidation.success,
            location: locationValidation.location,
            vpnResult: locationValidation.vpnResult,
            warning: !locationValidation.success ? {
                title: locationValidation.error.title,
                message: locationValidation.error.message,
                details: locationValidation.error.details,
                supportEmail: locationValidation.error.supportEmail
            } : null
        });
    } catch (error) {
        console.error('Location check error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Unable to verify your location. Please contact support.' 
        });
    }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                message: 'Current password and new password are required' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                message: 'New password must be at least 6 characters long' 
            });
        }

        // Get user
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ 
                message: 'Current password is incorrect' 
            });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        await User.updatePassword(req.user.id, hashedPassword);

        res.json({ 
            message: 'Password changed successfully' 
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            message: 'Access token required' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(403).json({ 
            message: 'Invalid or expired token' 
        });
    }
}

// Admin authorization middleware
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            message: 'Admin access required' 
        });
    }
    next();
}

// Make user admin (for setup purposes)
router.post('/make-admin', async (req, res) => {
    try {
        const { email, adminCode } = req.body;
        
        // Check admin code
        if (adminCode !== process.env.ADMIN_SETUP_CODE && adminCode !== 'ADMIN_SETUP_2024') {
            return res.status(403).json({ 
                message: 'Invalid admin setup code' 
            });
        }
        
        // Find user by email
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(404).json({ 
                message: 'User not found' 
            });
        }
        
        // Update user role to admin
        const result = await query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role',
            ['admin', user.id]
        );
        
        if (result.rows.length > 0) {
            res.json({
                message: 'User successfully promoted to admin',
                user: {
                    id: result.rows[0].id,
                    fullName: result.rows[0].full_name,
                    email: result.rows[0].email,
                    role: result.rows[0].role
                }
            });
        } else {
            res.status(500).json({ 
                message: 'Failed to update user role' 
            });
        }
        
    } catch (error) {
        console.error('Make admin error:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
});

// Helper function to validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Export middleware for use in other routes
router.authenticateToken = authenticateToken;
router.requireAdmin = requireAdmin;

module.exports = router;