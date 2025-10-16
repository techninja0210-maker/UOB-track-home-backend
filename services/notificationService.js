class NotificationService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // Map userId -> socketId
  }

  /**
   * Initialize Socket.IO
   */
  initialize(io) {
    this.io = io;

    io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Authenticate user
      socket.on('authenticate', (userId) => {
        if (userId) {
          this.userSockets.set(userId, socket.id);
          socket.userId = userId;
          socket.join(`user:${userId}`);
          console.log(`✅ User ${userId} authenticated on socket ${socket.id}`);
          
          // Send welcome notification
          socket.emit('notification', {
            type: 'info',
            title: 'Connected',
            message: 'Real-time notifications enabled',
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        if (socket.userId) {
          this.userSockets.delete(socket.userId);
        }
      });
    });

    console.log('✅ WebSocket notification service initialized');
  }

  /**
   * Send notification to a specific user
   */
  notifyUser(userId, notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized');
      return;
    }

    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(`user:${userId}`).emit('notification', {
        ...notification,
        timestamp: new Date().toISOString(),
      });
      console.log(`📤 Notification sent to user ${userId}:`, notification.title);
    } else {
      console.log(`ℹ️ User ${userId} is not connected (notification queued)`);
      // In production, you would store this in a database for later retrieval
    }
  }

  /**
   * Send deposit confirmation notification
   */
  notifyDeposit(userId, currency, amount, transactionHash) {
    this.notifyUser(userId, {
      type: 'success',
      title: 'Deposit Confirmed',
      message: `Your ${amount} ${currency} deposit has been confirmed`,
      data: {
        currency,
        amount,
        transactionHash,
      },
      action: {
        label: 'View Wallet',
        url: '/wallet',
      },
    });
  }

  /**
   * Send withdrawal approval notification
   */
  notifyWithdrawalApproval(userId, currency, amount, transactionHash) {
    this.notifyUser(userId, {
      type: 'success',
      title: 'Withdrawal Approved',
      message: `Your ${amount} ${currency} withdrawal has been approved and processed`,
      data: {
        currency,
        amount,
        transactionHash,
      },
      action: {
        label: 'View Transaction',
        url: '/transactions',
      },
    });
  }

  /**
   * Send withdrawal rejection notification
   */
  notifyWithdrawalRejection(userId, currency, amount, reason) {
    this.notifyUser(userId, {
      type: 'error',
      title: 'Withdrawal Rejected',
      message: `Your ${amount} ${currency} withdrawal was rejected: ${reason}`,
      data: {
        currency,
        amount,
        reason,
      },
      action: {
        label: 'View Wallet',
        url: '/wallet',
      },
    });
  }

  /**
   * Send gold purchase notification
   */
  notifyGoldPurchase(userId, goldGrams, cryptoCurrency, cryptoAmount, skrId) {
    this.notifyUser(userId, {
      type: 'success',
      title: 'Gold Purchase Successful',
      message: `You purchased ${goldGrams}g of gold with ${cryptoAmount} ${cryptoCurrency}`,
      data: {
        goldGrams,
        cryptoCurrency,
        cryptoAmount,
        skrId,
      },
      action: {
        label: 'View SKR',
        url: '/skrs',
      },
    });
  }

  /**
   * Send gold sale notification
   */
  notifyGoldSale(userId, goldGrams, cryptoCurrency, cryptoAmount) {
    this.notifyUser(userId, {
      type: 'success',
      title: 'Gold Sale Successful',
      message: `You sold ${goldGrams}g of gold for ${cryptoAmount} ${cryptoCurrency}`,
      data: {
        goldGrams,
        cryptoCurrency,
        cryptoAmount,
      },
      action: {
        label: 'View Wallet',
        url: '/wallet',
      },
    });
  }

  /**
   * Send price alert notification
   */
  notifyPriceAlert(userId, asset, price, condition) {
    this.notifyUser(userId, {
      type: 'warning',
      title: 'Price Alert',
      message: `${asset} ${condition} $${price}`,
      data: {
        asset,
        price,
        condition,
      },
      action: {
        label: 'View Exchange',
        url: '/exchange',
      },
    });
  }

  /**
   * Send admin notification (for pending approvals)
   */
  notifyAdmins(notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized');
      return;
    }

    this.io.emit('admin-notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
    console.log(`📤 Admin notification sent:`, notification.title);
  }

  /**
   * Notify admins of pending withdrawal
   */
  notifyPendingWithdrawal(userId, userName, currency, amount, withdrawalId) {
    this.notifyAdmins({
      type: 'warning',
      title: 'New Withdrawal Request',
      message: `${userName} requested ${amount} ${currency} withdrawal`,
      data: {
        userId,
        userName,
        currency,
        amount,
        withdrawalId,
      },
      action: {
        label: 'Review Withdrawal',
        url: '/admin/withdrawals',
      },
    });
  }

  /**
   * Broadcast system announcement to all users
   */
  broadcastAnnouncement(title, message, type = 'info') {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized');
      return;
    }

    this.io.emit('announcement', {
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
    });
    console.log(`📣 Announcement broadcast: ${title}`);
  }
}

module.exports = new NotificationService();


