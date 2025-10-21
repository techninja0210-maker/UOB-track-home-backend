const axios = require('axios');

class VPNDetectionService {
    /**
     * Known VPN/Proxy/Datacenter IP ranges and providers
     * This is a basic list - in production, you'd want a more comprehensive database
     */
    static KNOWN_VPN_PROVIDERS = [
        'NordVPN', 'ExpressVPN', 'Surfshark', 'CyberGhost', 'Private Internet Access',
        'IPVanish', 'Hotspot Shield', 'TunnelBear', 'Windscribe', 'ProtonVPN',
        'Mullvad', 'AirVPN', 'Perfect Privacy', 'IVPN', 'OVPN',
        'TorGuard', 'Hide.me', 'VPN.ac', 'AzireVPN', 'CactusVPN'
    ];

    /**
     * Known datacenter/hosting providers that are commonly used for VPNs
     */
    static KNOWN_DATACENTERS = [
        'Amazon Web Services', 'Google Cloud', 'Microsoft Azure', 'DigitalOcean',
        'Linode', 'Vultr', 'OVH', 'Hetzner', 'Scaleway', 'Cloudflare',
        'AWS', 'GCP', 'Azure', 'DO', 'Vultr', 'OVH', 'Hetzner'
    ];

    /**
     * Check if IP is a known VPN/Proxy using multiple detection methods
     */
    static async detectVPN(ipAddress) {
        try {
            // Skip VPN detection for local/private IPs
            if (this.isPrivateIP(ipAddress)) {
                return {
                    isVPN: false,
                    isProxy: false,
                    isDatacenter: false,
                    provider: null,
                    confidence: 0,
                    method: 'local_ip'
                };
            }

            // Use multiple detection methods for better accuracy
            const [vpnCheck, proxyCheck, datacenterCheck] = await Promise.allSettled([
                this.checkVPNServices(ipAddress),
                this.checkProxyServices(ipAddress),
                this.checkDatacenterServices(ipAddress)
            ]);

            const results = {
                isVPN: false,
                isProxy: false,
                isDatacenter: false,
                provider: null,
                confidence: 0,
                method: 'unknown'
            };

            // Process VPN check results
            if (vpnCheck.status === 'fulfilled' && vpnCheck.value.isVPN) {
                results.isVPN = true;
                results.provider = vpnCheck.value.provider;
                results.confidence = Math.max(results.confidence, vpnCheck.value.confidence);
                results.method = 'vpn_service';
            }

            // Process proxy check results
            if (proxyCheck.status === 'fulfilled' && proxyCheck.value.isProxy) {
                results.isProxy = true;
                results.provider = results.provider || proxyCheck.value.provider;
                results.confidence = Math.max(results.confidence, proxyCheck.value.confidence);
                results.method = results.method === 'unknown' ? 'proxy_service' : results.method;
            }

            // Process datacenter check results
            if (datacenterCheck.status === 'fulfilled' && datacenterCheck.value.isDatacenter) {
                results.isDatacenter = true;
                results.provider = results.provider || datacenterCheck.value.provider;
                results.confidence = Math.max(results.confidence, datacenterCheck.value.confidence);
                results.method = results.method === 'unknown' ? 'datacenter_service' : results.method;
            }

            // If any detection method found suspicious activity, mark as VPN
            if (results.isVPN || results.isProxy || results.isDatacenter) {
                results.isVPN = true; // Treat all as VPN for blocking purposes
            }

            return results;

        } catch (error) {
            console.warn('VPN detection failed:', error.message);
            return {
                isVPN: false,
                isProxy: false,
                isDatacenter: false,
                provider: null,
                confidence: 0,
                method: 'error'
            };
        }
    }

    /**
     * Check VPN services using ipapi.co (includes VPN detection)
     */
    static async checkVPNServices(ipAddress) {
        try {
            const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
                timeout: 5000
            });

            const data = response.data;
            
            // Check if the IP is flagged as VPN/Proxy
            const isVPN = data.threat?.is_vpn || 
                         data.threat?.is_proxy || 
                         data.threat?.is_tor ||
                         data.threat?.is_anonymous ||
                         data.threat?.is_known_attacker ||
                         false;

            // Check if the organization is a known VPN provider
            const org = data.org || '';
            const isKnownVPN = this.KNOWN_VPN_PROVIDERS.some(provider => 
                org.toLowerCase().includes(provider.toLowerCase())
            );

            return {
                isVPN: isVPN || isKnownVPN,
                provider: isKnownVPN ? org : (isVPN ? 'Unknown VPN/Proxy' : null),
                confidence: isKnownVPN ? 90 : (isVPN ? 70 : 0),
                method: 'ipapi_threat'
            };

        } catch (error) {
            console.warn('VPN service check failed:', error.message);
            return { isVPN: false, provider: null, confidence: 0, method: 'error' };
        }
    }

    /**
     * Check proxy services using ip-api.com
     */
    static async checkProxyServices(ipAddress) {
        try {
            const response = await axios.get(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,proxy,hosting`, {
                timeout: 5000
            });

            const data = response.data;
            
            if (data.status === 'fail') {
                return { isProxy: false, provider: null, confidence: 0, method: 'error' };
            }

            // Check if IP is flagged as proxy or hosting
            const isProxy = data.proxy === true || data.hosting === true;
            
            // Check if the organization is a known datacenter
            const org = data.org || '';
            const isKnownDatacenter = this.KNOWN_DATACENTERS.some(dc => 
                org.toLowerCase().includes(dc.toLowerCase())
            );

            return {
                isProxy: isProxy || isKnownDatacenter,
                provider: isKnownDatacenter ? org : (isProxy ? 'Unknown Proxy/Hosting' : null),
                confidence: isKnownDatacenter ? 85 : (isProxy ? 75 : 0),
                method: 'ip_api'
            };

        } catch (error) {
            console.warn('Proxy service check failed:', error.message);
            return { isProxy: false, provider: null, confidence: 0, method: 'error' };
        }
    }

    /**
     * Check datacenter services using ipinfo.io
     */
    static async checkDatacenterServices(ipAddress) {
        try {
            const response = await axios.get(`https://ipinfo.io/${ipAddress}/json`, {
                timeout: 5000
            });

            const data = response.data;
            
            // Check if IP is flagged as datacenter/hosting
            const isDatacenter = data.hosting === true || 
                               data.bogon === true ||
                               data.privacy?.vpn === true ||
                               data.privacy?.proxy === true ||
                               data.privacy?.tor === true ||
                               false;

            // Check if the organization is a known datacenter
            const org = data.org || '';
            const isKnownDatacenter = this.KNOWN_DATACENTERS.some(dc => 
                org.toLowerCase().includes(dc.toLowerCase())
            );

            return {
                isDatacenter: isDatacenter || isKnownDatacenter,
                provider: isKnownDatacenter ? org : (isDatacenter ? 'Unknown Datacenter' : null),
                confidence: isKnownDatacenter ? 80 : (isDatacenter ? 65 : 0),
                method: 'ipinfo'
            };

        } catch (error) {
            console.warn('Datacenter service check failed:', error.message);
            return { isDatacenter: false, provider: null, confidence: 0, method: 'error' };
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
     * Enhanced VPN detection specifically for US VPNs
     */
    static async detectUSVPN(ipAddress, countryCode) {
        try {
            // Only check for VPN if the IP appears to be from US
            if (countryCode !== 'US') {
                return {
                    isUSVPN: false,
                    isVPN: false,
                    provider: null,
                    confidence: 0,
                    method: 'not_us'
                };
            }

            const vpnResult = await this.detectVPN(ipAddress);
            
            return {
                isUSVPN: vpnResult.isVPN && countryCode === 'US',
                isVPN: vpnResult.isVPN,
                provider: vpnResult.provider,
                confidence: vpnResult.confidence,
                method: vpnResult.method
            };

        } catch (error) {
            console.warn('US VPN detection failed:', error.message);
            return {
                isUSVPN: false,
                isVPN: false,
                provider: null,
                confidence: 0,
                method: 'error'
            };
        }
    }

    /**
     * Get VPN detection message for blocked users
     */
    static getVPNBlockMessage(vpnResult) {
        if (vpnResult.isUSVPN) {
            return {
                title: 'VPN/Proxy Detected',
                message: 'We have detected that you are using a VPN, proxy, or datacenter connection. Our services are not available through such connections, especially from the United States.',
                details: 'Please disable your VPN or proxy service and try again. If you believe this is an error, please contact our support team.',
                supportEmail: 'support@uobsecurity.com',
                detectedProvider: vpnResult.provider,
                confidence: vpnResult.confidence
            };
        }

        return {
            title: 'VPN/Proxy Detected',
            message: 'We have detected that you are using a VPN, proxy, or datacenter connection. Our services are not available through such connections.',
            details: 'Please disable your VPN or proxy service and try again. If you believe this is an error, please contact our support team.',
            supportEmail: 'support@uobsecurity.com',
            detectedProvider: vpnResult.provider,
            confidence: vpnResult.confidence
        };
    }

    /**
     * Log VPN detection attempt
     */
    static async logVPNAttempt(req, email, vpnResult, location) {
        try {
            const { pool } = require('../config/database');
            
            const query = `
                INSERT INTO audit_logs (
                    action, target_table, target_id, 
                    diff, ip, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, created_at
            `;

            const vpnDetails = {
                email: email,
                action: 'vpn_detected',
                country: location?.country,
                country_code: location?.country_code,
                city: location?.city,
                isp: location?.isp,
                vpn_provider: vpnResult.provider,
                vpn_confidence: vpnResult.confidence,
                detection_method: vpnResult.method,
                is_us_vpn: vpnResult.isUSVPN,
                reason: 'vpn_proxy_detected'
            };

            const values = [
                'user_registration_blocked_vpn',
                'users',
                email,
                JSON.stringify(vpnDetails),
                location?.ipAddress || this.getClientIP(req),
                req.headers['user-agent'] || 'Unknown'
            ];

            await pool.query(query, values);
            console.log(`🚫 VPN detected: ${email} from ${location?.country} (${location?.city}) - Provider: ${vpnResult.provider}`);
        } catch (error) {
            console.error('Failed to log VPN attempt:', error);
        }
    }

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
}

module.exports = VPNDetectionService;
