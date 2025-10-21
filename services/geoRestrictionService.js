const axios = require('axios');
const VPNDetectionService = require('./vpnDetectionService');

class GeoRestrictionService {
    /**
     * List of restricted countries (ISO country codes)
     * Add or remove countries as needed
     */
    static RESTRICTED_COUNTRIES = [
        'US', // United States
        'CA', // Canada (example - remove if not needed)
        // Add more country codes as needed
    ];

    /**
     * List of restricted regions/states within countries
     * Format: { country: 'US', states: ['NY', 'CA', 'TX'] }
     */
    static RESTRICTED_REGIONS = [
        // Example: { country: 'US', states: ['NY', 'CA'] }
    ];

    /**
     * Get client IP address from request
     */
    static getClientIP(req) {
        const ip = req.headers['x-forwarded-for'] ||
                  req.headers['x-real-ip'] ||
                  req.headers['x-client-ip'] ||
                  req.connection?.remoteAddress ||
                  req.socket?.remoteAddress ||
                  req.ip ||
                  '127.0.0.1';

        return ip.split(',')[0].trim();
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
     * Get geolocation information for an IP address
     */
    static async getIPGeolocation(ipAddress) {
        try {
            // Skip geolocation for local/private IPs (allow local development)
            if (this.isPrivateIP(ipAddress)) {
                return {
                    country: 'Local',
                    country_code: 'LOCAL',
                    region: 'Local',
                    city: 'Local',
                    isp: 'Local Network',
                    allowed: true // Allow local development
                };
            }

            // Use ipapi.co for geolocation (free tier: 1000 requests/day)
            const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
                timeout: 5000
            });

            return {
                country: response.data.country_name || 'Unknown',
                country_code: response.data.country_code || 'UNKNOWN',
                region: response.data.region || 'Unknown',
                city: response.data.city || 'Unknown',
                isp: response.data.org || 'Unknown',
                allowed: this.isLocationAllowed(response.data.country_code, response.data.region)
            };
        } catch (error) {
            console.warn('Geolocation lookup failed:', error.message);
            return {
                country: 'Unknown',
                country_code: 'UNKNOWN',
                region: 'Unknown',
                city: 'Unknown',
                isp: 'Unknown',
                allowed: false // Block if we can't determine location
            };
        }
    }

    /**
     * Check if a location is allowed based on country and region
     */
    static isLocationAllowed(countryCode, region = null) {
        // Check if country is restricted
        if (this.RESTRICTED_COUNTRIES.includes(countryCode)) {
            // If country is restricted, check if specific regions are allowed
            const restrictedRegion = this.RESTRICTED_REGIONS.find(
                r => r.country === countryCode
            );
            
            if (restrictedRegion && region) {
                // If specific regions are restricted, check if this region is restricted
                return !restrictedRegion.states.includes(region);
            }
            
            // If no specific regions defined, entire country is restricted
            return false;
        }

        // Country is not in restricted list
        return true;
    }

    /**
     * Validate user location during registration
     */
    static async validateUserLocation(req) {
        try {
            const ipAddress = this.getClientIP(req);
            const geolocation = await this.getIPGeolocation(ipAddress);

            console.log(`🌍 Location check for IP ${ipAddress}:`, {
                country: geolocation.country,
                country_code: geolocation.country_code,
                region: geolocation.region,
                city: geolocation.city,
                allowed: geolocation.allowed
            });

            // Check for VPN/Proxy detection
            const vpnResult = await VPNDetectionService.detectUSVPN(ipAddress, geolocation.country_code);
            
            if (vpnResult.isUSVPN || vpnResult.isVPN) {
                console.log(`🚫 VPN/Proxy detected for IP ${ipAddress}:`, {
                    provider: vpnResult.provider,
                    confidence: vpnResult.confidence,
                    method: vpnResult.method,
                    isUSVPN: vpnResult.isUSVPN
                });

                return {
                    success: false,
                    ipAddress: ipAddress,
                    location: geolocation,
                    vpnResult: vpnResult,
                    error: VPNDetectionService.getVPNBlockMessage(vpnResult)
                };
            }

            return {
                success: geolocation.allowed,
                ipAddress: ipAddress,
                location: geolocation,
                vpnResult: vpnResult,
                error: geolocation.allowed ? null : this.getRestrictionMessage(geolocation)
            };
        } catch (error) {
            console.error('Location validation error:', error);
            return {
                success: false,
                ipAddress: this.getClientIP(req),
                location: null,
                vpnResult: null,
                error: 'Unable to verify your location. Please contact support.'
            };
        }
    }

    /**
     * Get appropriate restriction message based on location
     */
    static getRestrictionMessage(location) {
        if (location.country_code === 'US') {
            return {
                title: 'Registration Not Available',
                message: 'We apologize, but our services are currently not available to residents of the United States due to regulatory restrictions.',
                details: 'If you believe this is an error or have questions, please contact our support team.',
                supportEmail: 'support@uobsecurity.com'
            };
        }

        // Generic message for other restricted countries
        return {
            title: 'Service Not Available in Your Region',
            message: `We apologize, but our services are currently not available to residents of ${location.country} due to regulatory restrictions.`,
            details: 'If you believe this is an error or have questions, please contact our support team.',
            supportEmail: 'support@uobsecurity.com'
        };
    }

    /**
     * Log restricted registration attempt
     */
    static async logRestrictedAttempt(req, email, validationResult) {
        try {
            // If VPN was detected, use VPN logging
            if (validationResult.vpnResult && (validationResult.vpnResult.isVPN || validationResult.vpnResult.isUSVPN)) {
                await VPNDetectionService.logVPNAttempt(req, email, validationResult.vpnResult, validationResult.location);
                return;
            }

            // Otherwise, log as geographic restriction
            const { pool } = require('../config/database');
            
            const query = `
                INSERT INTO audit_logs (
                    action, target_table, target_id, 
                    diff, ip, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, created_at
            `;

            const restrictionDetails = {
                email: email,
                action: 'registration_blocked',
                country: validationResult.location?.country,
                country_code: validationResult.location?.country_code,
                region: validationResult.location?.region,
                city: validationResult.location?.city,
                isp: validationResult.location?.isp,
                reason: 'geographic_restriction'
            };

            const values = [
                'user_registration_blocked',
                'users',
                email,
                JSON.stringify(restrictionDetails),
                validationResult.ipAddress || this.getClientIP(req),
                req.headers['user-agent'] || 'Unknown'
            ];

            await pool.query(query, values);
            console.log(`🚫 Registration blocked: ${email} from ${validationResult.location?.country} (${validationResult.location?.city})`);
        } catch (error) {
            console.error('Failed to log restricted attempt:', error);
        }
    }

    /**
     * Get list of restricted countries (for admin display)
     */
    static getRestrictedCountries() {
        return this.RESTRICTED_COUNTRIES;
    }

    /**
     * Get list of restricted regions (for admin display)
     */
    static getRestrictedRegions() {
        return this.RESTRICTED_REGIONS;
    }

    /**
     * Update restricted countries (admin function)
     */
    static updateRestrictedCountries(countries) {
        this.RESTRICTED_COUNTRIES = countries;
        console.log('Updated restricted countries:', countries);
    }

    /**
     * Update restricted regions (admin function)
     */
    static updateRestrictedRegions(regions) {
        this.RESTRICTED_REGIONS = regions;
        console.log('Updated restricted regions:', regions);
    }
}

module.exports = GeoRestrictionService;
