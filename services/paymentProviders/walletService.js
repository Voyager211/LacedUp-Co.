const Wallet = require('../../models/Wallet');
const mongoose = require('mongoose');

/**
 * Get or create wallet for user
 */
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    wallet = new Wallet({
      userId,
      balance: 0,
      transactions: []
    });
    await wallet.save();
  } 

  return wallet;
};
 
/**
 * Get wallet by userId
 */
const getWallet = async (userId) => {
  return await Wallet.findOne({ userId }).lean();
};

/**
 * Add transaction to wallet
 */
const addTransaction = async (userId, transactionData) => {
  const wallet = await getOrCreateWallet(userId);

  // Validate transaction type
  if (!['credit', 'debit'].includes(transactionData.type)) {
    throw new Error('Invalid transaction type');
  }

  // ✅ FIXED: Manually generate transactionId here
  const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`;

  // Create transaction object
  const transaction = {
    transactionId: transactionId,  // ✅ Set it here!
    type: transactionData.type,
    amount: transactionData.amount,
    description: transactionData.description,
    paymentMethod: transactionData.paymentMethod || 'manual_credit',
    status: transactionData.status || 'completed',
    orderId: transactionData.orderId || null,
    returnId: transactionData.returnId || null,
    razorpayOrderId: transactionData.razorpayOrderId || null,
    razorpayPaymentId: transactionData.razorpayPaymentId || null,
    date: new Date()
  };

  // Calculate balance after transaction
  if (transaction.type === 'credit') {
    wallet.balance += transaction.amount;
  } else if (transaction.type === 'debit') {
    if (wallet.balance < transaction.amount) {
      throw new Error('Insufficient wallet balance');
    }
    wallet.balance -= transaction.amount;
  }

  // Set balance after transaction
  transaction.balanceAfter = wallet.balance;

  // Add transaction to wallet
  wallet.transactions.push(transaction);

  // Save wallet
  await wallet.save();

  // Return transaction details
  return {
    transactionId: transactionId,
    wallet: wallet
  };
};

/**
 * Get paginated transactions for user
 */
const getPaginatedTransactions = async (userId, page = 1, limit = 10, type = null) => {
  const skip = (page - 1) * limit;

  try {
    // ✅ FIXED: Simpler approach - get wallet and paginate in JavaScript
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return {
        transactions: [],
        currentPage: page,
        totalPages: 0,
        totalTransactions: 0,
        hasNextPage: false,
        hasPrevPage: false
      };
    }

    // Filter transactions by type if provided
    let transactions = wallet.transactions;
    
    if (type) {
      transactions = transactions.filter(t => t.type === type && t.status === 'completed');
    } else {
      transactions = transactions.filter(t => t.status === 'completed');
    }

    // Sort by date descending (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get total
    const totalTransactions = transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    // Paginate
    const paginatedTransactions = transactions.slice(skip, skip + limit);

    return {
      transactions: paginatedTransactions,
      currentPage: page,
      totalPages: totalPages,
      totalTransactions: totalTransactions,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error in getPaginatedTransactions:', error);
    throw error;
  }
};


/**
 * Get transactions by type (credit/debit)
 */
const getTransactionsByType = async (userId, type) => {
  const wallet = await Wallet.findOne({ userId }).lean();

  if (!wallet) return [];

  return wallet.transactions
    .filter((t) => t.type === type && t.status === 'completed')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

/**
 * Get transaction by ID
 */
const getTransactionById = async (userId, transactionId) => {
  const wallet = await Wallet.findOne({
    userId,
    'transactions.transactionId': transactionId
  });

  if (!wallet) return null;

  return wallet.transactions.find((t) => t.transactionId === transactionId);
};

/**
 * Update transaction status
 */
const updateTransactionStatus = async (userId, transactionId, status) => {
  const result = await Wallet.findOneAndUpdate(
    {
      userId,
      'transactions.transactionId': transactionId
    },
    {
      $set: { 'transactions.$.status': status }
    },
    { new: true }
  );

  return result;
};

/**
 * Add pending transaction (for payment processing)
 */
const addPendingTransaction = async (userId, transactionData) => {
  const wallet = await getOrCreateWallet(userId);

  // ✅ FIXED: Manually generate transactionId here
  const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`;

  const transaction = {
    transactionId: transactionId,  // ✅ Set it here!
    type: 'credit',
    amount: transactionData.amount,
    description: transactionData.description,
    paymentMethod: transactionData.paymentMethod,
    status: 'pending',
    razorpayOrderId: transactionData.razorpayOrderId || null,
    razorpayPaymentId: transactionData.razorpayPaymentId || null,
    date: new Date(),
    balanceAfter: wallet.balance // Balance not changed yet
  };

  wallet.transactions.push(transaction);
  await wallet.save();

  return {
    transactionId: transactionId,
    wallet: wallet
  };
};

/**
 * Complete pending transaction
 */
const completePendingTransaction = async (userId, transactionId) => {
  const wallet = await Wallet.findOne({
    userId,
    'transactions.transactionId': transactionId
  });

  if (!wallet) {
    throw new Error('Transaction not found');
  }

  const transactionIndex = wallet.transactions.findIndex(
    (t) => t.transactionId === transactionId
  );

  if (transactionIndex === -1) {
    throw new Error('Transaction not found');
  }

  const transaction = wallet.transactions[transactionIndex];

  // Update transaction status
  transaction.status = 'completed';

  // Update balance
  wallet.balance += transaction.amount;
  transaction.balanceAfter = wallet.balance;

  // Save wallet
  await wallet.save();

  return wallet;
};

/**
 * Fail pending transaction
 */
const failPendingTransaction = async (userId, transactionId) => {
  const wallet = await Wallet.findOne({
    userId,
    'transactions.transactionId': transactionId
  });

  if (!wallet) {
    throw new Error('Transaction not found');
  }

  const transaction = wallet.transactions.find((t) => t.transactionId === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  transaction.status = 'failed';
  await wallet.save();

  return wallet;
};

/**
 * Get wallet statistics
 */
const getWalletStats = async (userId) => {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    return {
      balance: 0,
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: 0,
      monthlyAdded: 0
    };
  }

  const completedTransactions = wallet.transactions.filter((t) => t.status === 'completed');
  const monthlyTransactions = completedTransactions.filter((t) => {
    const date = new Date(t.date);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  return {
    balance: wallet.balance,
    totalCredits: completedTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0),
    totalDebits: completedTransactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0),
    transactionCount: completedTransactions.length,
    monthlyAdded: monthlyTransactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0)
  };
};

/**
 * Add credit to wallet (for cancellation refunds)
 * @param {String} userId - User ID
 * @param {Number} amount - Amount to credit
 * @param {String} description - Transaction description
 * @param {String} orderId - Order ID (optional)
 * @returns {Object} - Result object
 */
const addCredit = async (userId, amount, description, orderId = null) => {
  try {
    // Validate inputs
    if (!userId || !amount || amount <= 0) {
      return {
        success: false,
        message: 'Invalid user ID or amount'
      };
    }

    // Use existing addTransaction method
    const result = await addTransaction(userId, {
      type: 'credit',
      amount: amount,
      description: description,
      paymentMethod: 'refund',
      status: 'completed',
      orderId: orderId
    });

    console.log(`✅ Credit added: ₹${amount} credited to user ${userId} - ${description}`);

    return {
      success: true,
      message: 'Credit added successfully',
      transactionId: result.transactionId,
      wallet: result.wallet,
      newBalance: result.wallet.balance
    };

  } catch (error) {
    console.error('❌ Error adding credit:', error);
    return {
      success: false,
      message: error.message || 'Failed to add credit',
      error: error.message
    };
  }
};

/**
 * Add return refund to wallet
 * @param {String} userId - User ID
 * @param {Number} amount - Refund amount
 * @param {String} orderId - Order ID
 * @param {String} returnId - Return request ID
 * @returns {Object} - Result object
 */
const addReturnRefund = async (userId, amount, orderId, returnId) => {
  try {
    // Validate inputs
    if (!userId || !amount || amount <= 0) {
      return {
        success: false,
        message: 'Invalid user ID or refund amount'
      };
    }

    // Use existing addTransaction method
    const description = `Refund for returned item in order ${orderId}`;
    
    const result = await addTransaction(userId, {
      type: 'credit',
      amount: amount,
      description: description,
      paymentMethod: 'refund',
      status: 'completed',
      orderId: orderId,
      returnId: returnId
    });

    console.log(`✅ Return refund processed: ₹${amount} credited to user ${userId} for order ${orderId}, return ${returnId}`);

    return {
      success: true,
      message: 'Return refund credited successfully',
      transactionId: result.transactionId,
      wallet: result.wallet,
      newBalance: result.wallet.balance,
      refundAmount: amount
    };

  } catch (error) {
    console.error('❌ Error processing return refund:', error);
    return {
      success: false,
      message: error.message || 'Failed to process return refund',
      error: error.message
    };
  }
};

/**
 * Deduct amount from wallet (for payments)
 * @param {String} userId - User ID
 * @param {Number} amount - Amount to deduct
 * @param {String} description - Transaction description
 * @param {String} orderId - Order ID (optional)
 * @returns {Object} - Result object
 */
const deductAmount = async (userId, amount, description, orderId = null) => {
  try {
    // Validate inputs
    if (!userId || !amount || amount <= 0) {
      return {
        success: false,
        message: 'Invalid user ID or amount'
      };
    }

    // Check wallet balance
    const wallet = await getWallet(userId);
    if (!wallet || wallet.balance < amount) {
      return {
        success: false,
        message: 'Insufficient wallet balance'
      };
    }

    // Use existing addTransaction method
    const result = await addTransaction(userId, {
      type: 'debit',
      amount: amount,
      description: description,
      paymentMethod: 'payment_for_order',
      status: 'completed',
      orderId: orderId
    });

    console.log(`✅ Amount deducted: ₹${amount} deducted from user ${userId} - ${description}`);

    return {
      success: true,
      message: 'Amount deducted successfully',
      transactionId: result.transactionId,
      wallet: result.wallet,
      newBalance: result.wallet.balance
    };

  } catch (error) {
    console.error('❌ Error deducting amount:', error);
    return {
      success: false,
      message: error.message || 'Failed to deduct amount',
      error: error.message
    };
  }
};


module.exports = {
  getOrCreateWallet,
  getWallet,
  addTransaction,
  addCredit,
  addReturnRefund,
  deductAmount,
  getPaginatedTransactions,
  getTransactionsByType,
  getTransactionById,
  updateTransactionStatus,
  addPendingTransaction,
  completePendingTransaction,
  failPendingTransaction,
  getWalletStats
};
