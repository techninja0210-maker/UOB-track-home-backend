const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { query } = require('../config/database');
const poolWalletService = require('../services/poolWalletService');
const poolWithdrawalService = require('../services/poolWithdrawalService');
const { ethers } = require('ethers');

// Get user's wallet with current values
router.get('/', async (req, res) => {
  try {
    let wallet = await Wallet.getWithValue(req.user.id);
    
    if (!wallet) {
      wallet = await Wallet.create(req.user.id);
      wallet = await Wallet.getWithValue(req.user.id);
    }

    res.json({
      btcBalance: parseFloat(wallet.btc_balance),
      usdtBalance: parseFloat(wallet.usdt_balance),
      ethBalance: parseFloat(wallet.eth_balance),
      btcValueUsd: parseFloat(wallet.btc_value_usd || 0),
      usdtValueUsd: parseFloat(wallet.usdt_value_usd || 0),
      ethValueUsd: parseFloat(wallet.eth_value_usd || 0),
      totalValueUsd: parseFloat(wallet.total_paid_usd || 0),
      btcAddress: wallet.btc_address,
      usdtAddress: wallet.usdt_address,
      ethAddress: wallet.eth_address
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ message: 'Failed to fetch wallet' });
  }
});

// Dashboard-specific balance endpoint
router.get('/balance', async (req, res) => {
  try {
    let wallet = await Wallet.getWithValue(req.user.id);
    
    if (!wallet) {
      wallet = await Wallet.create(req.user.id);
      wallet = await Wallet.getWithValue(req.user.id);
    }

    res.json({
      balances: [
        {
          currency: 'BTC',
          balance: parseFloat(wallet.btc_balance),
          symbol: '₿',
          valueUsd: parseFloat(wallet.btc_value_usd || 0),
          address: wallet.btc_address
        },
        {
          currency: 'USDT',
          balance: parseFloat(wallet.usdt_balance),
          symbol: '₮',
          valueUsd: parseFloat(wallet.usdt_value_usd || 0),
          address: wallet.usdt_address
        },
        {
          currency: 'ETH',
          balance: parseFloat(wallet.eth_balance),
          symbol: 'Ξ',
          valueUsd: parseFloat(wallet.eth_value_usd || 0),
          address: wallet.eth_address
        }
      ],
      totalValueUsd: parseFloat(wallet.total_paid_usd || 0)
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ message: 'Failed to fetch wallet balance' });
  }
});

// User platform balances endpoint (for main dashboard)
router.get('/balances', async (req, res) => {
  try {
    // Get user's platform balances from user_balances table
    const result = await query(`
      SELECT currency, balance, available_balance 
      FROM user_balances 
      WHERE user_id = $1
    `, [req.user.id]);

    // Initialize with default values
    const balances = {
      BTC: 0,
      ETH: 0,
      USDT: 0
    };

    // Update with actual balances from database
    result.rows.forEach(row => {
      if (balances.hasOwnProperty(row.currency)) {
        balances[row.currency] = parseFloat(row.balance);
      }
    });

    // Return in the format expected by frontend
    res.json([
      {
        currency: 'BTC',
        balance: balances.BTC,
        symbol: '₿',
        valueUsd: 0 // Will be calculated on frontend with real-time prices
      },
      {
        currency: 'ETH',
        balance: balances.ETH,
        symbol: 'Ξ',
        valueUsd: 0 // Will be calculated on frontend with real-time prices
      },
      {
        currency: 'USDT',
        balance: balances.USDT,
        symbol: '₮',
        valueUsd: 0 // Will be calculated on frontend with real-time prices
      }
    ]);
  } catch (error) {
    console.error('Get user balances error:', error);
    res.status(500).json({ message: 'Failed to fetch user balances' });
  }
});

// Get pool wallet address for a given currency (for direct MetaMask deposits)
router.get('/pool-address/:currency', async (req, res) => {
  try {
    const { currency } = req.params;
    if (!['BTC', 'ETH', 'USDT'].includes(currency.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid currency' });
    }

    await poolWalletService.initializePoolWallets();
    const poolAddresses = poolWalletService.getPoolAddresses();
    const address = poolAddresses[currency.toUpperCase()];

    if (!address) {
      return res.status(500).json({ message: 'Pool address unavailable' });
    }

    return res.json({ currency: currency.toUpperCase(), address });
  } catch (error) {
    console.error('Get pool address error:', error);
    res.status(500).json({ message: 'Failed to get pool address' });
  }
});

// Create a deposit intent (off-chain record that user will deposit to pool)
router.post('/deposit-intent', async (req, res) => {
  try {
    const { currency, amount } = req.body;

    if (!['BTC', 'ETH', 'USDT'].includes((currency || '').toUpperCase())) {
      return res.status(400).json({ message: 'Invalid currency' });
    }
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Record intent for visibility/audit (no on-chain tx here)
    await poolWalletService.initializePoolWallets();
    const poolAddresses = poolWalletService.getPoolAddresses();
    const poolAddress = poolAddresses[currency.toUpperCase()];
    
    await query(
      `INSERT INTO deposit_requests (user_id, currency, amount, wallet_address, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [
        req.user.id,
        currency.toUpperCase(),
        numericAmount,
        poolAddress
      ]
    );

    return res.status(201).json({
      message: 'Deposit intent recorded. Send funds to the pool address to complete.',
      status: 'pending'
    });
  } catch (error) {
    console.error('Create deposit intent error:', error);
    res.status(500).json({ message: 'Failed to create deposit intent' });
  }
});

// Process MetaMask deposit (automatic crediting)
router.post('/process-deposit', async (req, res) => {
  try {
    const { currency, amount, transactionHash, fromAddress } = req.body;
    
    console.log('🔄 Processing deposit request:', {
      userId: req.user.id,
      currency,
      amount,
      transactionHash,
      fromAddress
    });

    if (!['BTC', 'ETH', 'USDT'].includes((currency || '').toUpperCase())) {
      return res.status(400).json({ message: 'Invalid currency' });
    }
    
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    if (!transactionHash) {
      return res.status(400).json({ message: 'Transaction hash is required' });
    }

    // Get pool address for this currency
    await poolWalletService.initializePoolWallets();
    const poolAddresses = poolWalletService.getPoolAddresses();
    const poolAddress = poolAddresses[currency.toUpperCase()];

    if (!poolAddress) {
      return res.status(500).json({ message: 'Pool address not available' });
    }

    console.log('📋 Pool address found:', poolAddress);

    // Import userBalanceService
    const userBalanceService = require('../services/userBalanceService');
    
    // Process the deposit (automatically credit user balance)
    const result = await userBalanceService.processMetaMaskDeposit(
      req.user.id,
      currency.toUpperCase(),
      numericAmount,
      transactionHash,
      poolAddress,
      fromAddress
    );

    if (result.success) {
      // Update deposit request status
      await query(
        `UPDATE deposit_requests 
         SET status = 'completed', transaction_hash = $1, completed_at = NOW()
         WHERE user_id = $2 AND currency = $3 AND amount = $4 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [transactionHash, req.user.id, currency.toUpperCase(), numericAmount]
      );

      return res.status(200).json({
        message: 'Deposit processed successfully',
        newBalance: result.newBalance,
        amount: result.amount,
        currency: result.currency
      });
    } else {
      return res.status(400).json({ message: result.message });
    }

  } catch (error) {
    console.error('❌ Process deposit error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to process deposit', error: error.message });
  }
});

// Get wallet transactions (from transactions_ledger table)
router.get('/transactions', async (req, res) => {
  try {
    const { type, status, limit = 50 } = req.query;
    
    // Import userBalanceService to get transaction history
    const userBalanceService = require('../services/userBalanceService');
    
    // Get user transaction history
    const transactions = await userBalanceService.getUserTransactionHistory(req.user.id, parseInt(limit));
    
    // Filter by type and status if provided
    let filteredTransactions = transactions;
    
    if (type && type !== 'all') {
      filteredTransactions = filteredTransactions.filter(tx => tx.type === type);
    }
    
    if (status && status !== 'all') {
      filteredTransactions = filteredTransactions.filter(tx => tx.status === status);
    }

    // Format the transactions for the frontend
    const formatted = filteredTransactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      timestamp: tx.createdAt,
      description: tx.description,
      transactionHash: tx.transactionHash,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      referenceId: tx.referenceId
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

// Get deposit address and QR code
router.get('/deposit-address/:currency', async (req, res) => {
  try {
    const { currency } = req.params;
    const QRCode = require('qrcode');
    
    if (!['BTC', 'ETH', 'USDT'].includes(currency.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid currency' });
    }

    // Get user's wallet (create if doesn't exist)
    let wallet = await Wallet.findByUserId(req.user.id);
    
    if (!wallet) {
      wallet = await Wallet.create(req.user.id);
    }

    // Get unique user address for this currency (display only - money goes to pool)
    const address = await poolWalletService.getUserDepositAddress(req.user.id, currency);

    if (!address) {
      return res.status(500).json({ message: 'User address not available' });
    }

    // Generate QR code
    const qrCode = await QRCode.toDataURL(address);

    res.json({
      currency: currency.toUpperCase(),
      address,
      qrCode,
      message: `Send ${currency} to this address. Funds will be automatically forwarded to pool wallet and credited to your account.`
    });
  } catch (error) {
    console.error('Get deposit address error:', error);
    res.status(500).json({ message: 'Failed to get deposit address' });
  }
});

// Request deposit (manual notification)
router.post('/deposit', async (req, res) => {
  try {
    const { currency, transactionHash } = req.body;

    if (!currency || !transactionHash) {
      return res.status(400).json({ message: 'Currency and transaction hash are required' });
    }

    // Get user's wallet address
    const wallet = await Wallet.findByUserId(req.user.id);
    const addressColumn = `${currency.toLowerCase()}_address`;
    const walletAddress = wallet[addressColumn];

    // Create deposit notification
    const result = await query(
      `INSERT INTO deposit_requests (user_id, currency, wallet_address, transaction_hash, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [req.user.id, currency.toUpperCase(), walletAddress, transactionHash]
    );

    res.status(201).json({
      message: 'Deposit notification received. We will credit your account once confirmed on the blockchain.',
      depositId: result.rows[0].id,
      status: 'pending'
    });
  } catch (error) {
    console.error('Deposit request error:', error);
    res.status(500).json({ message: 'Failed to create deposit request' });
  }
});

// Request withdrawal (from pool wallet)
router.post('/withdrawal', async (req, res) => {
  try {
    const { currency, amount, destinationAddress } = req.body;

    const result = await poolWithdrawalService.createWithdrawalRequest(
      req.user.id,
      currency.toUpperCase(),
      parseFloat(amount),
      destinationAddress
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Withdrawal request error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get deposit/withdrawal history
router.get('/deposits', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM deposit_requests 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ message: 'Failed to fetch deposits' });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM withdrawal_requests 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawals' });
  }
});

module.exports = router;


