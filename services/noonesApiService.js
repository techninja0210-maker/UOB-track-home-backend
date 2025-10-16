const axios = require('axios');

class NoonesApiService {
  constructor() {
    this.baseUrl = 'https://api.noones.com';
    this.authUrl = 'https://auth.noones.com/oauth2/token';
    this.userInfoUrl = 'https://auth.noones.com/oauth2/userinfo';
    this.clientId = process.env.NOONES_API_KEY || null;
    this.clientSecret = process.env.NOONES_SECRET_KEY || null;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Get access token
  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Skip if credentials not configured
    if (!this.clientId || !this.clientSecret || 
        this.clientId === 'your_noones_api_key_here' || 
        this.clientSecret === 'your_noones_secret_key_here') {
      return null;
    }

    try {
      const response = await axios.post(this.authUrl, 
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry time (subtract 5 minutes for safety)
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
      
      return this.accessToken;
    } catch (error) {
      console.error('Noones API - Token error:', error.message);
      return null;
    }
  }

  // Get headers for authenticated requests
  async getHeaders() {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const token = await this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  // Get crypto prices from Noones
  async getCryptoPrices() {
    try {
      const headers = await this.getHeaders();
      if (!headers.Authorization) {
        console.log('Noones API - Skipping (no valid credentials)');
        return null;
      }

      const response = await axios.get(`${this.baseUrl}/prices`, {
        headers,
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get prices error:', error.message);
      throw error;
    }
  }

  // Get user wallet balance
  async getWalletBalance(userId) {
    try {
      const response = await axios.get(`${this.baseUrl}/wallet/balance`, {
        headers: this.getHeaders(),
        params: { user_id: userId },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get wallet balance error:', error.message);
      throw error;
    }
  }

  // Create wallet for user
  async createWallet(userId, currency = 'BTC') {
    try {
      const response = await axios.post(`${this.baseUrl}/wallet/create`, {
        user_id: userId,
        currency: currency
      }, {
        headers: this.getHeaders(),
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Create wallet error:', error.message);
      throw error;
    }
  }

  // Get wallet transactions
  async getWalletTransactions(userId, limit = 50) {
    try {
      const response = await axios.get(`${this.baseUrl}/wallet/transactions`, {
        headers: this.getHeaders(),
        params: { 
          user_id: userId,
          limit: limit
        },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get transactions error:', error.message);
      throw error;
    }
  }

  // Create crypto-to-gold exchange
  async createExchange(userId, fromCurrency, fromAmount, toGoldGrams) {
    try {
      const response = await axios.post(`${this.baseUrl}/exchange/create`, {
        user_id: userId,
        from_currency: fromCurrency,
        from_amount: fromAmount,
        to_gold_grams: toGoldGrams,
        exchange_type: 'crypto_to_gold'
      }, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Create exchange error:', error.message);
      throw error;
    }
  }

  // Get exchange quote
  async getExchangeQuote(fromCurrency, fromAmount, toCurrency = 'GOLD') {
    try {
      const response = await axios.post(`${this.baseUrl}/exchange/quote`, {
        from_currency: fromCurrency,
        from_amount: fromAmount,
        to_currency: toCurrency
      }, {
        headers: this.getHeaders(),
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get quote error:', error.message);
      throw error;
    }
  }

  // Get gold prices
  async getGoldPrices() {
    try {
      const response = await axios.get(`${this.baseUrl}/gold/prices`, {
        headers: this.getHeaders(),
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get gold prices error:', error.message);
      throw error;
    }
  }

  // Create deposit request
  async createDeposit(userId, currency, amount, walletAddress) {
    try {
      const response = await axios.post(`${this.baseUrl}/wallet/deposit`, {
        user_id: userId,
        currency: currency,
        amount: amount,
        wallet_address: walletAddress
      }, {
        headers: this.getHeaders(),
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Create deposit error:', error.message);
      throw error;
    }
  }

  // Create withdrawal request
  async createWithdrawal(userId, currency, amount, destinationAddress) {
    try {
      const response = await axios.post(`${this.baseUrl}/wallet/withdrawal`, {
        user_id: userId,
        currency: currency,
        amount: amount,
        destination_address: destinationAddress
      }, {
        headers: this.getHeaders(),
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Create withdrawal error:', error.message);
      throw error;
    }
  }

  // Get user profile
  async getUserProfile(userId) {
    try {
      const response = await axios.get(`${this.baseUrl}/user/profile`, {
        headers: this.getHeaders(),
        params: { user_id: userId },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get user profile error:', error.message);
      throw error;
    }
  }

  // Get user information (working endpoint)
  async getUserInfo() {
    try {
      const headers = await this.getHeaders();
      if (!headers.Authorization) {
        console.log('Noones API - Skipping getUserInfo (no valid credentials)');
        return null;
      }

      const response = await axios.get(this.userInfoUrl, { 
        headers,
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Noones API - Get user info error:', error.message);
      throw error;
    }
  }

  // Test API connection
  async testConnection() {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return {
          status: 'error',
          error: 'No valid credentials or token could not be obtained'
        };
      }

      // Test with user info endpoint since it's working
      try {
        const userInfo = await this.getUserInfo();
        return {
          status: 'connected',
          token: `${token.substring(0, 20)}...`,
          message: 'Successfully connected to Noones API',
          userInfo: userInfo
        };
      } catch (userError) {
        return {
          status: 'partial',
          token: `${token.substring(0, 20)}...`,
          message: 'Token obtained but user info failed',
          error: userError.message
        };
      }
    } catch (error) {
      console.error('Noones API - Connection test error:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = new NoonesApiService();

