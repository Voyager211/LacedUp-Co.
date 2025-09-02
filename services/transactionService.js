const Transaction = require('../models/Transaction');
const Cart = require('../models/Cart');
const Address = require('../models/Address');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * ✅ ENHANCED: Transaction Service with Wallet Integration
 * Handles all transaction-related operations including wallet transactions
 */

/**
 * Create a new transaction for order payment
 * @param {Object} data - Transaction data
 * @returns {Object} - Transaction result
 */
const createOrderTransaction = async (data) => {
  try {
    const { userId, paymentMethod, deliveryAddressId, amount, cartItems, pricing } = data;

    // Validate required data
    if (!userId || !paymentMethod || !deliveryAddressId || !amount) {
      throw new Error('Missing required transaction data');
    }

    // Create transaction
    const transaction = new Transaction({
      userId: userId,
      type: 'ORDER_PAYMENT',
      paymentMethod: paymentMethod,
      amount: amount,
      currency: 'INR',
      status: 'INITIATED',
      orderData: {
        deliveryAddressId: deliveryAddressId,
        items: cartItems,
        pricing: pricing
      },
      metadata: {
        userAgent: data.userAgent || '',
        ipAddress: data.ipAddress || '',
        sessionId: data.sessionId || ''
      }
    });

    await transaction.save();

    console.log(`✅ Transaction created: ${transaction.transactionId} for user ${userId}`);

    return {
      success: true,
      transaction: transaction,
      transactionId: transaction.transactionId
    };

  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Update transaction with payment gateway details
 * @param {String} transactionId - Transaction ID
 * @param {Object} gatewayData - Payment gateway response
 * @returns {Object} - Update result
 */
const updateTransactionGatewayDetails = async (transactionId, gatewayData) => {
  try {
    const transaction = await Transaction.findByTransactionId(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Update gateway details
    if (gatewayData.razorpayOrderId) {
      transaction.gatewayDetails.razorpayOrderId = gatewayData.razorpayOrderId;
    }
    
    if (gatewayData.paypalOrderId) {
      transaction.gatewayDetails.paypalOrderId = gatewayData.paypalOrderId;
    }

    if (gatewayData.gatewayResponse) {
      transaction.gatewayDetails.gatewayResponse = gatewayData.gatewayResponse;
    }

    // Update status to PENDING
    await transaction.updateStatus('PENDING', 'Payment gateway initialized');

    console.log(`✅ Transaction ${transactionId} updated with gateway details`);

    return {
      success: true,
      transaction: transaction
    };

  } catch (error) {
    console.error('❌ Error updating transaction gateway details:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Complete transaction after successful payment
 * @param {String} transactionId - Transaction ID
 * @param {String} orderId - Created order ID
 * @param {Object} paymentDetails - Payment confirmation details
 * @returns {Object} - Completion result
 */
const completeTransaction = async (transactionId, orderId, paymentDetails = {}) => {
  try {
    const transaction = await Transaction.findByTransactionId(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status === 'COMPLETED') {
      console.log(`⚠️ Transaction ${transactionId} already completed`);
      return {
        success: true,
        transaction: transaction,
        message: 'Transaction already completed'
      };
    }

    // Update payment details
    if (paymentDetails.razorpayPaymentId) {
      transaction.gatewayDetails.razorpayPaymentId = paymentDetails.razorpayPaymentId;
      transaction.gatewayDetails.razorpaySignature = paymentDetails.razorpaySignature;
    }

    if (paymentDetails.paypalCaptureId) {
      transaction.gatewayDetails.paypalCaptureId = paymentDetails.paypalCaptureId;
    }

    if (paymentDetails.walletTransactionId) {
      transaction.metadata.walletTransactionId = paymentDetails.walletTransactionId;
    }

    // Mark as completed
    await transaction.markAsCompleted(orderId, 'Payment verified and order created successfully');

    console.log(`✅ Transaction ${transactionId} completed for order ${orderId}`);

    return {
      success: true,
      transaction: transaction
    };

  } catch (error) {
    console.error('❌ Error completing transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Mark transaction as failed
 * @param {String} transactionId - Transaction ID
 * @param {String} reason - Failure reason
 * @param {String} code - Failure code
 * @returns {Object} - Failure result
 */
const failTransaction = async (transactionId, reason, code = null) => {
  try {
    const transaction = await Transaction.findByTransactionId(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    await transaction.markAsFailed(reason, code);

    console.log(`❌ Transaction ${transactionId} marked as failed: ${reason}`);

    return {
      success: true,
      transaction: transaction
    };

  } catch (error) {
    console.error('❌ Error failing transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Cancel transaction (user cancelled payment)
 * @param {String} transactionId - Transaction ID
 * @param {String} reason - Cancellation reason
 * @returns {Object} - Cancellation result
 */
const cancelTransaction = async (transactionId, reason = 'User cancelled payment') => {
  try {
    const transaction = await Transaction.findByTransactionId(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    await transaction.updateStatus('CANCELLED', reason);

    console.log(`⚠️ Transaction ${transactionId} cancelled: ${reason}`);

    return {
      success: true,
      transaction: transaction
    };

  } catch (error) {
    console.error('❌ Error cancelling transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get transaction by ID
 * @param {String} transactionId - Transaction ID
 * @returns {Object} - Transaction data
 */
const getTransaction = async (transactionId) => {
  try {
    const transaction = await Transaction.findByTransactionId(transactionId)
      .populate('userId', 'name email phone');
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return {
      success: true,
      transaction: transaction
    };

  } catch (error) {
    console.error('❌ Error getting transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get user transaction history
 * @param {String} userId - User ID
 * @param {Object} options - Pagination options
 * @returns {Object} - Transaction history
 */
const getUserTransactionHistory = async (userId, options = {}) => {
  try {
    const { limit = 20, skip = 0, status, type } = options;
    
    let query = { userId: userId };
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('userId', 'name email');

    const totalCount = await Transaction.countDocuments(query);

    return {
      success: true,
      transactions: transactions,
      totalCount: totalCount,
      currentPage: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(totalCount / limit)
    };

  } catch (error) {
    console.error('❌ Error getting transaction history:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * ✅ ENHANCED: Create wallet-specific transaction
 * @param {Object} data - Wallet transaction data
 * @returns {Object} - Transaction result
 */
const createWalletTransaction = async (data) => {
  try {
    const { userId, type, amount, description, orderId, returnId, metadata } = data;

    // Validate required data
    if (!userId || !type || !amount) {
      throw new Error('Missing required wallet transaction data');
    }

    // Generate transaction ID
    const transactionId = `TX${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create transaction record
    const transaction = new Transaction({
      transactionId: transactionId,
      userId: userId,
      type: type, // 'WALLET_CREDIT', 'WALLET_DEBIT', 'WALLET_TOPUP'
      paymentMethod: data.paymentMethod || 'wallet',
      amount: amount,
      currency: 'INR',
      status: 'PENDING',
      description: description,
      orderId: orderId,
      returnId: returnId,
      metadata: {
        walletOperation: true,
        description: description,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        sessionId: data.sessionId,
        ...metadata
      }
    });

    await transaction.save();

    console.log(`✅ Wallet transaction created: ${transactionId}, Type: ${type}, Amount: ₹${amount}`);

    return {
      success: true,
      transaction: transaction,
      transactionId: transactionId
    };

  } catch (error) {
    console.error('❌ Error creating wallet transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create COD completion transaction
 * @param {Object} data - COD completion data
 * @returns {Object} - Transaction result
 */
const createCODCompletionTransaction = async (data) => {
  try {
    const { userId, orderId, amount, itemDetails } = data;

    const transactionId = `COD${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const transaction = new Transaction({
      transactionId: transactionId,
      userId: userId,
      type: 'COD_PAYMENT_COMPLETED',
      paymentMethod: 'cod',
      amount: amount,
      currency: 'INR',
      status: 'COMPLETED', // COD is completed on delivery
      description: `COD payment completed for order ${orderId}`,
      orderId: orderId,
      metadata: {
        deliveryCompleted: true,
        itemCount: itemDetails ? itemDetails.length : 0,
        items: itemDetails || []
      }
    });

    await transaction.save();

    console.log(`✅ COD completion transaction created: ${transactionId} for order ${orderId}`);

    return {
      success: true,
      transaction: transaction,
      transactionId: transactionId
    };

  } catch (error) {
    console.error('❌ Error creating COD completion transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * ✅ NEW: Get user transactions with filtering
 * @param {String} userId - User ID
 * @param {Object} options - Filter options
 * @returns {Array} - Filtered transactions
 */
const getUserTransactions = async (userId, options = {}) => {
  try {
    const query = { userId: userId };
    
    if (options.types && Array.isArray(options.types)) {
      query.type = { $in: options.types };
    } else if (options.type) {
      query.type = options.type;
    }
    
    if (options.status) {
      query.status = options.status;
    }

    if (options.orderId) {
      query.orderId = options.orderId;
    }
    
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100);

    return transactions;

  } catch (error) {
    console.error('❌ Error getting user transactions:', error);
    throw error;
  }
};

/**
 * Get transaction analytics for user
 * @param {String} userId - User ID
 * @returns {Object} - Transaction analytics
 */
const getUserTransactionAnalytics = async (userId) => {
  try {
    const transactions = await Transaction.find({ userId: userId });

    const analytics = {
      totalTransactions: transactions.length,
      completedTransactions: transactions.filter(t => t.status === 'COMPLETED').length,
      failedTransactions: transactions.filter(t => t.status === 'FAILED').length,
      pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
      walletTransactions: transactions.filter(t => t.type.includes('WALLET')).length,
      orderTransactions: transactions.filter(t => t.type.includes('ORDER')).length,
      codTransactions: transactions.filter(t => t.type.includes('COD')).length,
      totalAmount: transactions
        .filter(t => t.status === 'COMPLETED')
        .reduce((sum, t) => sum + t.amount, 0)
    };

    return {
      success: true,
      analytics: analytics
    };

  } catch (error) {
    console.error('❌ Error getting transaction analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Clean up expired transactions
 * @returns {Object} - Cleanup result
 */
const cleanupExpiredTransactions = async () => {
  try {
    const result = await Transaction.deleteMany({
      status: { $in: ['FAILED', 'CANCELLED', 'EXPIRED'] },
      createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 days old
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} expired transactions`);

    return {
      success: true,
      deletedCount: result.deletedCount
    };

  } catch (error) {
    console.error('❌ Error cleaning up transactions:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createOrderTransaction,
  updateTransactionGatewayDetails,
  completeTransaction,
  failTransaction,
  cancelTransaction,
  getTransaction,
  getUserTransactionHistory,
  createWalletTransaction,
  cleanupExpiredTransactions,
  createCODCompletionTransaction,
  getUserTransactions,
  getUserTransactionAnalytics
};
