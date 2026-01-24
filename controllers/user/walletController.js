const Wallet = require('../../models/Wallet');
const walletService = require('../../services/paymentProviders/walletService');
const { razorpayInstance } = require('../../services/paymentProviders/razorpay');
const crypto = require('crypto');


/**
 * GET /wallet
 * Render wallet page with user's balance and transactions
 */
const renderWalletPage = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.session.userId;
    console.log(userId);
    
    if (!userId) {
      req.flash('error', 'Please log in to continue');
      return res.redirect('/login');
    }

    // Get user data
    const User = require('../../models/User');
    const user = await User.findById(userId);

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/login');
    }

    // Get or create wallet
    const wallet = await walletService.getOrCreateWallet(userId);

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Get paginated transactions
    const transactionData = await walletService.getPaginatedTransactions(userId, page, limit);

    // Get wallet statistics
    const stats = await walletService.getWalletStats(userId);

    // Calculate pagination data
    const { transactions, currentPage, totalPages, totalTransactions } = transactionData;
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const prevPage = hasPrevPage ? currentPage - 1 : null;
    const nextPage = hasNextPage ? currentPage + 1 : null;

    // Generate page numbers (show up to 5 pages around current page)
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // Render with pagination data
    res.render('user/wallet', {
      user,
      wallet,
      transactions,
      currentPage,
      totalPages,
      hasPrevPage,
      hasNextPage,
      prevPage,
      nextPage,
      pageNumbers,
      totalTransactions,
      stats,
      title: 'My Wallet',
      layout: 'user/layouts/user-layout',
      active: 'wallet'
    });
  } catch (error) {
    console.error('Error rendering wallet page:', error);
    req.flash('error', 'Failed to load wallet');
    res.redirect('/');
  }
};


/**
 * GET /wallet/transactions/paginated
 * Get paginated transactions with optional filtering
 */
const getPaginatedTransactionsAPI = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const type = req.query.type || null;
    const limit = 10;

    // Validate page
    if (page < 1) {
      return res.status(400).json({ success: false, message: 'Invalid page number' });
    }

    // Get paginated transactions
    const data = await walletService.getPaginatedTransactions(userId, page, limit, type);

    // Calculate pagination metadata
    const { transactions, currentPage, totalPages, totalTransactions } = data;
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const prevPage = hasPrevPage ? currentPage - 1 : null;
    const nextPage = hasNextPage ? currentPage + 1 : null;

    // Generate page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    res.json({
      success: true,
      data: {
        transactions,
        currentPage,
        totalPages,
        totalTransactions,
        hasPrevPage,
        hasNextPage,
        prevPage,
        nextPage,
        pageNumbers
      }
    });
  } catch (error) {
    console.error('Error fetching paginated transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};



/**
 * POST /wallet/topup/create-order
 * Create a Razorpay order for wallet top-up
 */
const createRazorpayOrderHandler = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const { amount, paymentMethod, description } = req.body;

    // Validation
    if (!amount || amount < 1 || amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Minimum 1, Maximum 50,000'
      });
    }

    if (!paymentMethod || !['razorpay', 'upi', 'paypal'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    // For now, only support UPI (Razorpay)
    if (paymentMethod !== 'razorpay' && paymentMethod !== 'upi') {
      return res.status(400).json({
        success: false,
        message: 'Payment method not supported yet'
      });
    }

    // Create pending transaction
    const transactionResult = await walletService.addPendingTransaction(userId, {
      amount,
      description: description || `Wallet top-up`,
      paymentMethod: 'razorpay'
    });

    // ✅ FIXED: Create Razorpay order using the instance directly
    const razorpayOrderOptions = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: `wallet_${transactionResult.transactionId}`,
      payment_capture: 1
    };

    const razorpayOrder = await razorpayInstance.orders.create(razorpayOrderOptions);

    // Update transaction with Razorpay order ID
    await Wallet.findOneAndUpdate(
      {
        userId,
        'transactions.transactionId': transactionResult.transactionId
      },
      {
        $set: {
          'transactions.$.razorpayOrderId': razorpayOrder.id
        }
      }
    );

    res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: amount,
      currency: 'INR',
      razorpayOrderId: razorpayOrder.id,
      transactionId: transactionResult.transactionId
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
    });
  }
};


/**
 * POST /wallet/topup/verify-razorpay
 * Verify Razorpay payment and complete transaction
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const { razorpayPaymentId, razorpayOrderId, razorpaysignature, transactionId } = req.body;

    // Validate signature
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaysignature) {
      // Mark transaction as failed
      await walletService.failPendingTransaction(userId, transactionId);

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Update transaction with payment details
    await Wallet.findOneAndUpdate(
      {
        userId,
        'transactions.transactionId': transactionId
      },
      {
        $set: {
          'transactions.$.razorpayPaymentId': razorpayPaymentId,
          'transactions.$.status': 'completed'
        }
      }
    );

    // Complete the transaction (update balance)
    const wallet = await walletService.completePendingTransaction(userId, transactionId);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      newBalance: wallet.balance
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
};


/**
 * POST /wallet/add-money (Legacy - for direct add)
 * Add money directly to wallet (for testing or other purposes)
 */
const addMoney = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const { amount, description } = req.body;

    // Validation
    if (!amount || amount < 1 || amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Add transaction
    const result = await walletService.addTransaction(userId, {
      type: 'credit',
      amount,
      description: description || 'Added to wallet',
      paymentMethod: 'manual_credit',
      status: 'completed'
    });

    // Get updated wallet
    const wallet = await walletService.getWallet(userId);

    res.json({
      success: true,
      message: 'Money added to wallet',
      newBalance: wallet.balance,
      transactionId: result.transactionId
    });
  } catch (error) {
    console.error('Error adding money:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add money'
    });
  }
};


/**
 * GET /wallet/balance
 * Get current wallet balance
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;

    const wallet = await walletService.getOrCreateWallet(userId);

    res.json({
      success: true,
      balance: wallet.balance
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balance'
    });
  }
};


/**
 * GET /wallet/stats
 * Get wallet statistics
 */
const getWalletStatsAPI = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;

    const stats = await walletService.getWalletStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
};


/**
 * GET /wallet/transaction/:transactionId
 * Get specific transaction details
 */
const getTransaction = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const { transactionId } = req.params;

    const transaction = await walletService.getTransactionById(userId, transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction'
    });
  }
};


/**
 * POST /wallet/debit (For order payments)
 * Debit from wallet for orders
 */
const debitWallet = async (req, res) => {
  try {
    const userId = req.session.userId || req.user._id;
    const { amount, orderId, description } = req.body;

    // Validation
    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Check wallet balance
    const wallet = await walletService.getWallet(userId);
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }

    // Add debit transaction
    const result = await walletService.addTransaction(userId, {
      type: 'debit',
      amount,
      description: description || `Payment for order ${orderId}`,
      paymentMethod: 'payment_for_order',
      orderId,
      status: 'completed'
    });

    // Get updated wallet
    const updatedWallet = await walletService.getWallet(userId);

    res.json({
      success: true,
      message: 'Debited from wallet',
      newBalance: updatedWallet.balance,
      transactionId: result.transactionId
    });
  } catch (error) {
    console.error('Error debiting wallet:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to debit wallet'
    });
  }
};


module.exports = {
  renderWalletPage,
  getPaginatedTransactionsAPI,
  createRazorpayOrder: createRazorpayOrderHandler,
  verifyRazorpayPayment,
  addMoney,
  getWalletBalance,
  getWalletStatsAPI,
  getTransaction,
  debitWallet
};
