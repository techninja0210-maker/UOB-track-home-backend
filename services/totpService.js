/**
 * TOTP (Time-based One-Time Password) Service
 * Implements authenticator app-based 2FA using TOTP algorithm
 */
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class TOTPService {
  constructor() {
    this.issuer = process.env.TOTP_ISSUER || 'UOB Security House';
  }

  /**
   * Generate a TOTP secret for a user
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @returns {object} - Secret object with base32 secret and otpauth_url
   */
  generateSecret(userId, userEmail) {
    const secret = speakeasy.generateSecret({
      name: `${this.issuer} (${userEmail})`,
      issuer: this.issuer,
      length: 32
    });

    console.log(`✅ TOTP secret generated for user ${userId}`);

    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
      manual_entry_key: secret.base32
    };
  }

  /**
   * Generate QR code data URL for TOTP setup
   * @param {string} otpauthUrl - OTPAuth URL from secret
   * @returns {Promise<string>} - QR code as data URL
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 1
      });

      return qrCodeDataUrl;
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Verify a TOTP token
   * @param {string} secret - Base32 secret
   * @param {string} token - The 6-digit token to verify
   * @param {number} window - Time window for verification (default: 1, meaning ±30 seconds)
   * @returns {boolean} - True if token is valid
   */
  verifyToken(secret, token, window = 1) {
    if (!secret || !token) {
      return false;
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: window // Allow ±1 time step (30 seconds)
    });

    if (verified) {
      console.log(`✅ TOTP token verified successfully`);
    } else {
      console.log(`❌ TOTP token verification failed`);
    }

    return verified;
  }

  /**
   * Generate a TOTP token (for testing purposes)
   * @param {string} secret - Base32 secret
   * @returns {string} - 6-digit token
   */
  generateToken(secret) {
    if (!secret) {
      throw new Error('Secret is required');
    }

    return speakeasy.totp({
      secret: secret,
      encoding: 'base32'
    });
  }

  /**
   * Format manual entry key with spaces for readability
   * @param {string} base32Key - Base32 key
   * @returns {string} - Formatted key with spaces (e.g., "ABCD EFGH IJKL MNOP")
   */
  formatManualEntryKey(base32Key) {
    if (!base32Key) return '';
    
    // Add space every 4 characters
    return base32Key.match(/.{1,4}/g)?.join(' ') || base32Key;
  }
}

// Export singleton instance
module.exports = new TOTPService();

