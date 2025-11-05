/**
 * Two-Factor Authentication Service
 * Stores 2FA codes in memory (no database needed)
 */
class TwoFactorService {
  constructor() {
    // In-memory storage: userId -> { code, expiry }
    this.codes = new Map();
    
    // Clean up expired codes every 5 minutes
    setInterval(() => this.cleanupExpiredCodes(), 5 * 60 * 1000);
  }

  /**
   * Generate and store a 2FA code for a user
   * @param {string} userId - User ID
   * @param {number} expiryMinutes - Code expiry in minutes (default: 10)
   * @returns {string} - The generated 6-digit code
   */
  generateCode(userId, expiryMinutes = 10) {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Calculate expiry time
    const expiry = Date.now() + (expiryMinutes * 60 * 1000);
    
    // Store in memory
    this.codes.set(userId, {
      code,
      expiry
    });
    
    console.log(`✅ 2FA code generated for user ${userId}, expires in ${expiryMinutes} minutes`);
    
    return code;
  }

  /**
   * Verify a 2FA code for a user
   * @param {string} userId - User ID
   * @param {string} code - The code to verify
   * @returns {boolean} - True if code is valid, false otherwise
   */
  verifyCode(userId, code) {
    const stored = this.codes.get(userId);
    
    // No code stored
    if (!stored) {
      console.log(`❌ No 2FA code found for user ${userId}`);
      return false;
    }
    
    // Code expired
    if (Date.now() > stored.expiry) {
      console.log(`❌ 2FA code expired for user ${userId}`);
      this.codes.delete(userId); // Clean up
      return false;
    }
    
    // Code doesn't match
    if (stored.code !== code) {
      console.log(`❌ Invalid 2FA code for user ${userId}`);
      return false;
    }
    
    // Code is valid - remove it (one-time use)
    this.codes.delete(userId);
    console.log(`✅ 2FA code verified for user ${userId}`);
    return true;
  }

  /**
   * Check if a user has a pending 2FA code
   * @param {string} userId - User ID
   * @returns {boolean} - True if user has a pending code
   */
  hasPendingCode(userId) {
    const stored = this.codes.get(userId);
    if (!stored) return false;
    
    // Check if expired
    if (Date.now() > stored.expiry) {
      this.codes.delete(userId);
      return false;
    }
    
    return true;
  }

  /**
   * Remove/clear a code for a user
   * @param {string} userId - User ID
   */
  clearCode(userId) {
    this.codes.delete(userId);
  }

  /**
   * Clean up expired codes (called automatically)
   */
  cleanupExpiredCodes() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, data] of this.codes.entries()) {
      if (now > data.expiry) {
        this.codes.delete(userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired 2FA codes`);
    }
  }

  /**
   * Get stats (for debugging)
   */
  getStats() {
    return {
      totalCodes: this.codes.size,
      activeCodes: Array.from(this.codes.values()).filter(
        data => Date.now() <= data.expiry
      ).length
    };
  }
}

// Export singleton instance
module.exports = new TwoFactorService();

