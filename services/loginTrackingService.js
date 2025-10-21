const { pool } = require('../config/database');
const axios = require('axios');

class LoginTrackingService {
    /**
     * Get client IP address from request
     * Handles various proxy headers and forwarded IPs
     */
    static getClientIP(req) {
        // Check various headers for IP address
        const ip = req.headers['x-forwarded-for'] ||
                  req.headers['x-real-ip'] ||
                  req.headers['x-client-ip'] ||
                  req.connection?.remoteAddress ||
                  req.socket?.remoteAddress ||
                  req.ip ||
                  '127.0.0.1';

        // If x-forwarded-for contains multiple IPs, take the first one
        return ip.split(',')[0].trim();
    }

    /**
     * Get geolocation information for an IP address
     * Uses free IP geolocation service
     */
    static async getIPGeolocation(ipAddress) {
        try {
            // Skip geolocation for local/private IPs
            if (this.isPrivateIP(ipAddress)) {
                return {
                    country: 'Local',
                    city: 'Local',
                    isp: 'Local Network'
                };
            }

            // Use ipapi.co for geolocation (free tier: 1000 requests/day)
            const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
                timeout: 5000
            });

            return {
                country: response.data.country_name || 'Unknown',
                city: response.data.city || 'Unknown',
                isp: response.data.org || 'Unknown'
            };
        } catch (error) {
            console.warn('Geolocation lookup failed:', error.message);
            return {
                country: 'Unknown',
                city: 'Unknown',
                isp: 'Unknown'
            };
        }
    }

    /**
     * Check if IP address is private/local
     */
    static isPrivateIP(ip) {
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^127\./,
            /^::1$/,
            /^fe80:/i,
            /^fc00:/i,
            /^fd00:/i
        ];

        return privateRanges.some(range => range.test(ip));
    }

    /**
     * Log successful login attempt
     */
    static async logSuccessfulLogin(userId, email, req, token) {
        try {
            const ipAddress = this.getClientIP(req);
            const userAgent = req.headers['user-agent'] || 'Unknown';
            const geolocation = await this.getIPGeolocation(ipAddress);

            // Hash the token for storage (don't store full JWT)
            const tokenHash = require('crypto')
                .createHash('sha256')
                .update(token)
                .digest('hex')
                .substring(0, 32);

            const query = `
                INSERT INTO audit_logs (
                    actor_user_id, action, target_table, target_id, 
                    diff, ip, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, created_at
            `;

            const loginDetails = {
                email: email,
                success: true,
                session_token_hash: tokenHash,
                country: geolocation.country,
                city: geolocation.city,
                isp: geolocation.isp,
                login_type: 'password'
            };

            const values = [
                userId,
                'user_login_success',
                'users',
                userId,
                JSON.stringify(loginDetails),
                ipAddress,
                userAgent
            ];

            const result = await pool.query(query, values);
            
            console.log(`✅ Login logged: User ${email} from ${ipAddress} (${geolocation.city}, ${geolocation.country})`);
            
            return result.rows[0];
        } catch (error) {
            console.error('Failed to log successful login:', error);
            // Don't throw error - login should still succeed even if logging fails
        }
    }

    /**
     * Log failed login attempt
     */
    static async logFailedLogin(email, req, failureReason) {
        try {
            const ipAddress = this.getClientIP(req);
            const userAgent = req.headers['user-agent'] || 'Unknown';
            const geolocation = await this.getIPGeolocation(ipAddress);

            const query = `
                INSERT INTO audit_logs (
                    action, target_table, target_id, 
                    diff, ip, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, created_at
            `;

            const loginDetails = {
                email: email,
                success: false,
                failure_reason: failureReason,
                country: geolocation.country,
                city: geolocation.city,
                isp: geolocation.isp,
                login_type: 'password'
            };

            const values = [
                'user_login_failed',
                'users',
                email, // Use email as target_id for failed logins
                JSON.stringify(loginDetails),
                ipAddress,
                userAgent
            ];

            const result = await pool.query(query, values);
            
            console.log(`❌ Failed login logged: ${email} from ${ipAddress} (${geolocation.city}, ${geolocation.country}) - ${failureReason}`);
            
            return result.rows[0];
        } catch (error) {
            console.error('Failed to log failed login:', error);
            // Don't throw error - should not affect login flow
        }
    }

    /**
     * Get login history for a user
     */
    static async getUserLoginHistory(userId, limit = 50) {
        try {
            const query = `
                SELECT 
                    id,
                    actor_user_id as user_id,
                    action,
                    diff,
                    ip as ip_address,
                    user_agent,
                    created_at as login_timestamp
                FROM audit_logs 
                WHERE (actor_user_id = $1 OR (action LIKE '%login%' AND diff->>'email' = (SELECT email FROM users WHERE id = $1)))
                AND action IN ('user_login_success', 'user_login_failed')
                ORDER BY created_at DESC 
                LIMIT $2
            `;

            const result = await pool.query(query, [userId, limit]);
            
            // Transform the data to match the expected format
            return result.rows.map(row => {
                const details = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff;
                return {
                    id: row.id,
                    user_id: row.user_id,
                    email: details.email,
                    ip_address: row.ip_address,
                    user_agent: row.user_agent,
                    login_timestamp: row.login_timestamp,
                    success: details.success,
                    failure_reason: details.failure_reason,
                    country: details.country,
                    city: details.city,
                    isp: details.isp,
                    created_at: row.login_timestamp
                };
            });
        } catch (error) {
            console.error('Failed to get user login history:', error);
            throw error;
        }
    }

    /**
     * Get recent login attempts from an IP address
     */
    static async getIPLoginHistory(ipAddress, limit = 20) {
        try {
            const query = `
                SELECT 
                    id,
                    actor_user_id as user_id,
                    action,
                    diff,
                    ip as ip_address,
                    user_agent,
                    created_at as login_timestamp
                FROM audit_logs 
                WHERE ip = $1 
                AND action IN ('user_login_success', 'user_login_failed')
                ORDER BY created_at DESC 
                LIMIT $2
            `;

            const result = await pool.query(query, [ipAddress, limit]);
            
            // Transform the data to match the expected format
            return result.rows.map(row => {
                const details = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff;
                return {
                    id: row.id,
                    user_id: row.user_id,
                    email: details.email,
                    ip_address: row.ip_address,
                    user_agent: row.user_agent,
                    login_timestamp: row.login_timestamp,
                    success: details.success,
                    failure_reason: details.failure_reason,
                    country: details.country,
                    city: details.city,
                    isp: details.isp
                };
            });
        } catch (error) {
            console.error('Failed to get IP login history:', error);
            throw error;
        }
    }

    /**
     * Get suspicious login activity (multiple failed attempts, different countries, etc.)
     */
    static async getSuspiciousActivity(hours = 24) {
        try {
            const query = `
                SELECT 
                    ip,
                    COUNT(*) as attempt_count,
                    COUNT(CASE WHEN action = 'user_login_failed' THEN 1 END) as failed_attempts,
                    COUNT(DISTINCT diff->>'email') as unique_emails,
                    COUNT(DISTINCT diff->>'country') as unique_countries,
                    MAX(created_at) as last_attempt,
                    STRING_AGG(DISTINCT diff->>'country', ', ') as countries
                FROM audit_logs 
                WHERE created_at >= NOW() - INTERVAL '${hours} hours'
                AND action IN ('user_login_success', 'user_login_failed')
                GROUP BY ip
                HAVING 
                    COUNT(CASE WHEN action = 'user_login_failed' THEN 1 END) >= 3 
                    OR COUNT(DISTINCT diff->>'email') >= 5
                    OR COUNT(DISTINCT diff->>'country') >= 2
                ORDER BY failed_attempts DESC, attempt_count DESC
            `;

            const result = await pool.query(query);
            return result.rows.map(row => ({
                ip_address: row.ip,
                attempt_count: parseInt(row.attempt_count),
                failed_attempts: parseInt(row.failed_attempts),
                unique_emails: parseInt(row.unique_emails),
                unique_countries: parseInt(row.unique_countries),
                last_attempt: row.last_attempt,
                countries: row.countries
            }));
        } catch (error) {
            console.error('Failed to get suspicious activity:', error);
            throw error;
        }
    }

    /**
     * Get login statistics for admin dashboard
     */
    static async getLoginStatistics(days = 30) {
        try {
            const query = `
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as total_logins,
                    COUNT(CASE WHEN action = 'user_login_success' THEN 1 END) as successful_logins,
                    COUNT(CASE WHEN action = 'user_login_failed' THEN 1 END) as failed_logins,
                    COUNT(DISTINCT actor_user_id) as unique_users,
                    COUNT(DISTINCT ip) as unique_ips
                FROM audit_logs 
                WHERE created_at >= NOW() - INTERVAL '${days} days'
                AND action IN ('user_login_success', 'user_login_failed')
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `;

            const result = await pool.query(query);
            return result.rows.map(row => ({
                date: row.date,
                total_logins: parseInt(row.total_logins),
                successful_logins: parseInt(row.successful_logins),
                failed_logins: parseInt(row.failed_logins),
                unique_users: parseInt(row.unique_users),
                unique_ips: parseInt(row.unique_ips)
            }));
        } catch (error) {
            console.error('Failed to get login statistics:', error);
            throw error;
        }
    }
}

module.exports = LoginTrackingService;
