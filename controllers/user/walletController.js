const Wallet = require('../../models/Wallet');
const User = require('../../models/User');
const walletService = require('../../services/walletService'); // ✅ ADD: Import walletService

// Get user wallet details
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data
    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // ✅ FIXED: Use walletService functions properly
    const walletBalance = await walletService.getWalletBalance(userId.toString());
    
    // Get transaction history with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const transactionHistory = await walletService.getTransactionHistory(userId.toString(), page, limit);

    res.render('user/wallet', {
      user,
      wallet: {
        balance: walletBalance.balance,
        transactions: transactionHistory.transactions,
        totalTransactions: transactionHistory.totalTransactions,
        currentPage: transactionHistory.currentPage,
        totalPages: transactionHistory.totalPages,
        hasNextPage: transactionHistory.hasNextPage,
        hasPrevPage: transactionHistory.hasPrevPage
      },
      title: 'My Wallet',
      layout: 'user/layouts/user-layout',
      active: 'wallet'
    });

  } catch (error) {
    console.error('Error loading wallet:', error);
    res.status(500).render('errors/server-error', {
      message: 'Error loading wallet',
      error: error.message,
      layout: 'user/layouts/user-layout'
    });
  }
};

// Get wallet balance (API endpoint)
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // ✅ FIXED: Use walletService function
    const walletBalance = await walletService.getWalletBalance(userId.toString());

    res.json({
      success: true,
      balance: walletBalance.balance
    });

  } catch (error) {
    console.error('Error getting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting wallet balance'
    });
  }
};

// Get transaction history (API endpoint)
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // ✅ FIXED: Use walletService function
    const transactionHistory = await walletService.getTransactionHistory(userId.toString(), page, limit);

    res.json({
      success: true,
      ...transactionHistory
    });

  } catch (error) {
    console.error('Error getting transaction history:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting transaction history'
    });
  }
};

// Use wallet balance for payment
exports.useWalletForPayment = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { amount, orderId, description } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // ✅ FIXED: Check balance first using walletService
    const hasSufficientBalance = await walletService.hasSufficientBalance(userId.toString(), amount);
    
    if (!hasSufficientBalance) {
      const walletBalance = await walletService.getWalletBalance(userId.toString());
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        currentBalance: walletBalance.balance,
        requiredAmount: amount
      });
    }

    // ✅ FIXED: Use walletService function
    const result = await walletService.debitAmount(
      userId.toString(),
      amount,
      description || 'Payment for order',
      orderId
    );

    res.json({
      success: true,
      message: 'Payment successful',
      newBalance: result.newBalance,
      amountDebited: amount
    });

  } catch (error) {
    console.error('Error processing wallet payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing wallet payment'
    });
  }
};

// Add money to wallet (for testing purposes - in production this would be through payment gateway)
exports.addMoneyToWallet = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { amount, description } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    if (amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum amount allowed is ₹50,000'
      });
    }

    // ✅ FIXED: Use walletService function
    const result = await walletService.addCredit(
      userId.toString(),
      amount,
      description || 'Money added to wallet'
    );

    res.json({
      success: true,
      message: 'Money added successfully',
      newBalance: result.newBalance,
      amountAdded: amount
    });

  } catch (error) {
    console.error('Error adding money to wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding money to wallet'
    });
  }
};

// Get wallet statistics for admin
exports.getWalletStatistics = async (req, res) => {
  try {
    const stats = await Promise.all([
      // Total wallets
      Wallet.countDocuments(),
      
      // Total wallet balance across all users
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' }
          }
        }
      ]),
      
      // Total transactions
      Wallet.aggregate([
        {
          $project: {
            transactionCount: { $size: '$transactions' }
          }
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: '$transactionCount' }
          }
        }
      ]),
      
      // Recent transactions
      Wallet.aggregate([
        { $unwind: '$transactions' },
        { $sort: { 'transactions.date': -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            'transactions.transactionId': 1,
            'transactions.type': 1,
            'transactions.amount': 1,
            'transactions.description': 1,
            'transactions.date': 1,
            'user.name': 1,
            'user.email': 1
          }
        }
      ])
    ]);

    res.json({
      success: true,
      statistics: {
        totalWallets: stats[0],
        totalBalance: stats[1][0]?.totalBalance || 0,
        totalTransactions: stats[2][0]?.totalTransactions || 0,
        recentTransactions: stats[3]
      }
    });

  } catch (error) {
    console.error('Error getting wallet statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting wallet statistics'
    });
  }
};
