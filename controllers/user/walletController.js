const Wallet = require('../../models/Wallet');
const User = require('../../models/User');
const mongoose = require('mongoose');
const walletService = require('../../services/walletService'); 
const transactionService = require('../../services/transactionService');


/**
 * Get wallet page with balance and transactions
 */
exports.getWallet = async (req, res) => {
  console.log('🚀 WALLET CONTROLLER - Loading wallet page...');
  const startTime = Date.now();
  
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
    
    if (!wallet) {
      const newWallet = new Wallet({
        userId: userId,
        balance: 0,
        transactions: []
      });
      await newWallet.save();
      wallet = { balance: 0, transactions: [] };
    }

    // ✅ DATABASE-LEVEL PAGINATION: Get first page using walletService
    const page = 1;
    const limit = 6;
    
    const result = await walletService.getTransactionHistory(userId, page, limit);
    
    // ✅ PAGINATION DATA: For pagination partial
    const paginationData = {
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage
    };

    console.log(`💰 Wallet loaded in ${Date.now() - startTime}ms - Balance: ₹${wallet.balance}`);

    res.render('user/wallet', {
      user,
      wallet: {
        balance: wallet.balance,
        transactions: result.transactions,
        totalTransactions: result.totalTransactions
      },
      // ✅ ADD: Pagination data for partial
      currentPage: paginationData.currentPage,
      totalPages: paginationData.totalPages,
      title: 'My Wallet',
      layout: 'user/layouts/user-layout',
      active: 'wallet'
    });

  } catch (error) {
    console.error('❌ Wallet page error:', error);
    res.status(500).render('errors/server-error', {
      message: 'Error loading wallet',
      layout: 'user/layouts/user-layout'
    });
  }
};

/**
 * Get wallet balance (API endpoint)
 */
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .select('balance')
      .lean();

    const balance = wallet ? wallet.balance : 0;

    res.json({
      success: true,
      balance: balance
    });

  } catch (error) {
    console.error('❌ Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting wallet balance'
    });
  }
};

/**
 * Add money to wallet
 */
exports.addMoney = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { amount, description } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || numAmount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Must be between ₹1 and ₹50,000'
      });
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    
    if (!wallet) {
      wallet = new Wallet({
        userId: userId,
        balance: 0,
        transactions: []
      });
    }

    // Update balance and add transaction
    const newBalance = wallet.balance + numAmount;
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const newTransaction = {
      transactionId: transactionId,
      type: 'credit',
      amount: numAmount,
      description: description || 'Money added to wallet',
      date: new Date(),
      balanceAfter: newBalance,
      status: 'completed'
    };

    wallet.balance = newBalance;
    wallet.transactions.push(newTransaction);
    
    await wallet.save();

    console.log(`💰 Added ₹${numAmount} to wallet for user ${userId} - New balance: ₹${newBalance}`);

    res.json({
      success: true,
      message: 'Money added successfully',
      newBalance: newBalance,
      amountAdded: numAmount,
      transaction: newTransaction
    });

  } catch (error) {
    console.error('❌ Add money error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding money to wallet'
    });
  }
};

/**
 * Use wallet for payment
 */
exports.useWallet = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { amount, description, orderId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    
    if (!wallet || wallet.balance < numAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        currentBalance: wallet ? wallet.balance : 0,
        requiredAmount: numAmount
      });
    }

    // Update balance and add transaction
    const newBalance = wallet.balance - numAmount;
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const newTransaction = {
      transactionId: transactionId,
      type: 'debit',
      amount: numAmount,
      description: description || 'Payment',
      orderId: orderId || null,
      date: new Date(),
      balanceAfter: newBalance,
      status: 'completed'
    };

    wallet.balance = newBalance;
    wallet.transactions.push(newTransaction);
    
    await wallet.save();

    console.log(`💰 Deducted ₹${numAmount} from wallet for user ${userId} - New balance: ₹${newBalance}`);

    res.json({
      success: true,
      message: 'Payment successful',
      newBalance: newBalance,
      amountDebited: numAmount,
      transaction: newTransaction
    });

  } catch (error) {
    console.error('❌ Use wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing wallet payment'
    });
  }
};

/**
 * Get transaction history (API endpoint)
 */
exports.getTransactions = async (req, res) => {
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

    const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .select('transactions')
      .lean();

    if (!wallet || !wallet.transactions) {
      return res.json({
        success: true,
        transactions: [],
        totalTransactions: 0,
        currentPage: page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      });
    }

    // Sort transactions by date (latest first)
    const sortedTransactions = wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Paginate
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = sortedTransactions.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(wallet.transactions.length / limit);

    res.json({
      success: true,
      transactions: paginatedTransactions,
      totalTransactions: wallet.transactions.length,
      currentPage: page,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting transaction history'
    });
  }
};

exports.getTransactionsPaginated = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 6; // ✅ 6 transactions per page as requested
    const type = req.query.type || ''; // credit, debit, or empty for all

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // ✅ Use existing walletService method
    const result = await walletService.getTransactionHistory(userId, page, limit);

    // ✅ Apply client-side type filtering if needed
    let transactions = result.transactions;
    if (type && ['credit', 'debit'].includes(type)) {
      transactions = result.transactions.filter(t => t.type === type);
    }

    res.json({
      success: true,
      data: {
        transactions: transactions,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalTransactions: result.totalTransactions,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
        filters: { type }
      }
    });

  } catch (error) {
    console.error('❌ Get paginated transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading transactions'
    });
  }
};

exports.getWalletReconciliation = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const walletService = require('../../services/walletService');
    const reconciliation = await walletService.getWalletReconciliation(userId);

    res.json(reconciliation);

  } catch (error) {
    console.error('❌ Error getting wallet reconciliation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet reconciliation'
    });
  }
};

// Topup wallet using upi/paypal
exports.createWalletTopUpOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { amount, paymentMethod, description } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || numAmount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Must be between ₹1 and ₹50,000'
      });
    }

    // Validate payment method
    if (!['upi', 'paypal'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method for wallet top-up'
      });
    }

    // ✅ FIXED: Use existing transactionService only
    const transactionService = require('../../services/transactionService');
    
    const transactionResult = await transactionService.createWalletTransaction({
      userId: userId,
      type: 'WALLET_TOPUP',
      amount: numAmount,
      paymentMethod: paymentMethod,
      description: description || `Wallet top-up via ${paymentMethod.toUpperCase()}`,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      sessionId: req.sessionID,
      metadata: {
        topUpMethod: paymentMethod
      }
    });

    if (!transactionResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create wallet top-up transaction'
      });
    }

    let gatewayResult;

    // Create payment gateway order based on method
    if (paymentMethod === 'upi') {
      // Create Razorpay order for UPI payment
      const razorpayService = require('../../services/razorpay');
      gatewayResult = await razorpayService.createOrder(
        numAmount,
        'INR',
        transactionResult.transactionId,
        `Wallet Top-up ${transactionResult.transactionId}`
      );

      if (!gatewayResult.success) {
        await transactionService.updateTransactionStatus(transactionResult.transactionId, 'FAILED', 'Razorpay order creation failed');
        return res.status(500).json({
          success: false,
          message: 'Failed to create UPI payment order'
        });
      }

      // Update transaction with gateway details
      await transactionService.updateTransactionGatewayDetails(transactionResult.transactionId, {
        razorpayOrderId: gatewayResult.order.id,
        gatewayResponse: gatewayResult
      });

      return res.json({
        success: true,
        transactionId: transactionResult.transactionId,
        paymentMethod: 'upi',
        razorpayOrderId: gatewayResult.order.id,
        amount: gatewayResult.order.amount,
        currency: gatewayResult.order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      });

    } else if (paymentMethod === 'paypal') {
      // Create PayPal order for wallet top-up
      const { paypalClient } = require('../../services/paypal');
      const paypal = require('@paypal/checkout-server-sdk');

      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: transactionResult.transactionId,
          amount: {
            currency_code: 'USD',
            value: (numAmount / 80).toFixed(2) // Convert INR to USD
          },
          description: `Wallet Top-up - ${description || 'Add money to wallet'}`
        }],
        application_context: {
          brand_name: 'LacedUp Wallet',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${req.protocol}://${req.get('host')}/profile/wallet?topup=success`,
          cancel_url: `${req.protocol}://${req.get('host')}/profile/wallet?topup=cancelled`
        }
      });

      const paypalOrder = await paypalClient.execute(request);

      // Update transaction with gateway details
      await transactionService.updateTransactionGatewayDetails(transactionResult.transactionId, {
        paypalOrderId: paypalOrder.result.id,
        gatewayResponse: paypalOrder.result
      });

      return res.json({
        success: true,
        transactionId: transactionResult.transactionId,
        paymentMethod: 'paypal',
        orderID: paypalOrder.result.id
      });
    }

  } catch (error) {
    console.error('❌ Error creating wallet top-up order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create wallet top-up order'
    });
  }
};

exports.verifyWalletTopUpPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, transactionId } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification data'
      });
    }

    // Verify payment signature
    const razorpayService = require('../../services/razorpay');
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      const transactionService = require('../../services/transactionService');
      await transactionService.updateTransactionStatus(transactionId, 'FAILED', 'Invalid payment signature');
      
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get transaction data
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);
    
    if (!transactionResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    // ✅ FIXED: Credit wallet using walletService
    const walletService = require('../../services/walletService');
    const creditResult = await walletService.addCredit(
      userId,
      transaction.amount,
      transaction.description || `Wallet top-up via UPI - ${transactionId}`,
      null, // no orderId for wallet top-up
      null, // no returnId
      {
        paymentMethod: 'upi',
        razorpayPaymentId: razorpay_payment_id,
        transactionId: transactionId
      }
    );

    if (!creditResult.success) {
      await transactionService.updateTransactionStatus(transactionId, 'FAILED', 'Wallet credit failed');
      return res.status(500).json({
        success: false,
        message: 'Failed to credit wallet'
      });
    }

    // Complete transaction
    await transactionService.completeTransaction(transactionId, 'WALLET_TOPUP', {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      walletTransactionId: creditResult.transactionId
    });

    console.log(`✅ Wallet top-up successful: ₹${transaction.amount} via UPI for user ${userId}`);

    res.json({
      success: true,
      message: 'Wallet top-up successful',
      newBalance: creditResult.newBalance,
      amountAdded: transaction.amount,
      transactionId: creditResult.transactionId
    });

  } catch (error) {
    console.error('❌ Error verifying wallet top-up payment:', error);
    
    if (req.body.transactionId) {
      const transactionService = require('../../services/transactionService');
      await transactionService.updateTransactionStatus(req.body.transactionId, 'FAILED', 'Payment verification failed');
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to verify wallet top-up payment'
    });
  }
};


// Capture wallet top-up payment (PayPal)
exports.captureWalletTopUpPayment = async (req, res) => {
  try {
    const { paypalOrderId, transactionId } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    // Capture PayPal payment
    const { paypalClient } = require('../../services/paypal');
    const paypal = require('@paypal/checkout-server-sdk');
    
    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});

    const capture = await paypalClient.execute(request);
    
    if (capture.result.status !== 'COMPLETED') {
      const transactionService = require('../../services/transactionService');
      await transactionService.updateTransactionStatus(transactionId, 'FAILED', 'PayPal payment capture failed');
      
      return res.status(400).json({
        success: false,
        message: 'PayPal payment capture failed'
      });
    }

    // Get transaction data
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);
    
    if (!transactionResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    // ✅ FIXED: Credit wallet using walletService
    const walletService = require('../../services/walletService');
    const creditResult = await walletService.addCredit(
      userId,
      transaction.amount,
      transaction.description || `Wallet top-up via PayPal - ${transactionId}`,
      null, // no orderId for wallet top-up
      null, // no returnId
      {
        paymentMethod: 'paypal',
        paypalCaptureId: capture.result.purchase_units[0].payments.captures[0].id,
        transactionId: transactionId
      }
    );

    if (!creditResult.success) {
      await transactionService.updateTransactionStatus(transactionId, 'FAILED', 'Wallet credit failed');
      return res.status(500).json({
        success: false,
        message: 'Failed to credit wallet'
      });
    }

    // Complete transaction
    await transactionService.completeTransaction(transactionId, 'WALLET_TOPUP', {
      paypalCaptureId: capture.result.purchase_units[0].payments.captures[0].id,
      walletTransactionId: creditResult.transactionId
    });

    console.log(`✅ Wallet top-up successful: ₹${transaction.amount} via PayPal for user ${userId}`);

    res.json({
      success: true,
      message: 'Wallet top-up successful',
      newBalance: creditResult.newBalance,
      amountAdded: transaction.amount,
      transactionId: creditResult.transactionId
    });

  } catch (error) {
    console.error('❌ Error capturing wallet top-up payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to capture wallet top-up payment'
    });
  }
};
