// services/walletService.js
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const mongoose = require('mongoose');
// const { session } = require('passport');

/**
 * Validate user exists and is not blocked
 * @param {String} userId - User ID
 * @returns {Object} - User object if valid
 */
const validateUser = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (user.isBlocked) {
    throw new Error('User account is blocked - wallet operations not allowed');
  }
  
  return user;
};

/**
 * Get or create wallet for a user
 * @param {String} userId - User ID
 * @returns {Object} - Wallet object
 */
const getOrCreateWallet = async (userId) => {
  try {
    await validateUser(userId);

    
    const userObjectId = new mongoose.Types.ObjectId(userId);
    let wallet = await Wallet.findOne({ userId: userObjectId });
    
    if (!wallet) {
      wallet = new Wallet({
        userId: userObjectId, // ✅ Use ObjectId
        balance: 0,
        transactions: []
      });
      await wallet.save();
      console.log(`Created new wallet for user ${userId}`);
    }
    
    return wallet;
  } catch (error) {
    console.error('Error getting or creating wallet:', error);
    throw error;
  }
};



/**
 * Add credit to user wallet
 * @param {String} userId - User ID
 * @param {Number} amount - Amount to credit
 * @param {String} description - Transaction description
 * @param {String} orderId - Optional order ID
 * @param {String} returnId - Optional return ID
 * @returns {Object} - Result object
 */
const addCredit = async (userId, amount, description, orderId = null, returnId = null, metadata = {}) => {
  try {
    if (amount <= 0) {
      throw new Error('Credit amount must be greater than 0');
    }

    const wallet = await getOrCreateWallet(userId);
    const newBalance = wallet.balance + amount;

    let unifiedTransactionId = null;
    try{
      const transactionService = require('./transactionService');
      const unifiedTxResult = await transactionService.createWalletTransaction({
        userId: userId,
        type: 'WALLET_CREDIT',
        amount: amount,
        description: description,
        orderId: orderId,
        returnId: returnId,
        metadata: {
          walletBalanceBefore: wallet.balance,
          walletBalanceAfter: newBalance,
          operation: 'credit',
          ...metadata
        }
      });

      if (unifiedTxResult.success) {
        unifiedTransactionId = unifiedTxResult.transactionId;
        console.log(`Unified transaction created: ${unifiedTransactionId}`);
      } 
    } catch (unifiedTxError) {
      console.warn('Failed to create unified transaction, proceeding with wallet-only transaction: ', unifiedTxError.message);
    }

    // generate unique transaction ID
    const walletTransactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    wallet.transactions.push({
      transactionId: walletTransactionId,
      type: 'credit',
      amount: amount,
      description: description,
      orderId: orderId,
      returnId: returnId,
      unifiedTransactionId: unifiedTransactionId,
      balanceAfter: newBalance,
      status: 'completed'
    });
    
    wallet.balance = newBalance;
    
    // ✅ FIXED: Save without session (no MongoDB transactions)
    await wallet.save();

    // Mark unified transaction as completed
    if (unifiedTransactionId) {
      try {
        const transactionService = require('./transactionService');
        await transactionService.completeTransaction(
          unifiedTransactionId,
          orderId || returnId || 'WALLET_CREDIT',
          {walletTransactionId}
        );
      } catch (completeError) {
        console.warn ('Failed to complete unified transaction:', completeError.message);
      }
    }

    console.log(`Wallet Credit: ₹${amount} for user ${userId}, Unified TX: ${unifiedTransactionId || 'N/A'}`);

    return {
      success: true,
      newBalance: wallet.balance,
      transactionId: walletTransactionId,
      transaction: wallet.transactions[wallet.transactions.length - 1],
      message: `₹${amount} credited to wallet successfully`
    };
  } catch (error) {
    console.error('Error adding credit to wallet:', error);
    throw error;
  }
};

/**
 * Debit amount from user wallet
 * @param {String} userId - User ID
 * @param {Number} amount - Amount to debit
 * @param {String} description - Transaction description
 * @param {String} orderId - Optional order ID
 * @returns {Object} - Result object
 */
const debitAmount = async (userId, amount, description, orderId = null, metadata = {}) => {
  try {
    if (amount <= 0) {
      throw new Error('Debit amount must be greater than 0');
    }

    const wallet = await getOrCreateWallet(userId);
    
    if (wallet.balance < amount) {
      throw new Error(`Insufficient wallet balance. Required: ₹${amount}, Available: ₹${wallet.balance}`);
    }
    
    const newBalance = wallet.balance - amount;

    // Create unified transaction record
    let unifiedTransactionId = null;
    try {
      const transactionService = require('./transactionService');
      const unifiedTxResult = await transactionService.createWalletTransaction({
        userId: userId,
        type: 'WALLET_DEBIT',
        amount: amount,
        description: description,
        orderId: orderId,
        metadata: {
          walletBalanceBefore: wallet.balance,
          walletBalanceAfter: newBalance,
          operation: 'debit',
          ...metadata
        }
      });

      if (unifiedTxResult.success) {
        unifiedTransactionId = unifiedTxResult.transaction.transactionId;
        console.log(`✅ Unified transaction created: ${unifiedTransactionId}`);
      }
    } catch (unifiedTxError) {
      console.warn('⚠️ Failed to create unified transaction, proceeding with wallet-only transaction:', unifiedTxError.message);
    }

    const walletTransactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    wallet.transactions.push({
      type: 'debit',
      transactionId: walletTransactionId,
      amount: amount,
      description: description,
      orderId: orderId,
      unifiedTransactionId: unifiedTransactionId,
      balanceAfter: newBalance,
      status: 'completed'
    });
    
    wallet.balance = newBalance;
    
    // ✅ FIXED: Save without session (no MongoDB transactions)
    await wallet.save();

    console.log(`Debited ₹${amount} from wallet for user ${userId}`);

    // Mark unified transaction as completed
    if (unifiedTransactionId) {
      try {
        const transactionService = require('./transactionService');
        await transactionService.completeTransaction(
          unifiedTransactionId,
          orderId || 'WALLET_DEBIT',
          { walletTransactionId }
        );
      } catch (completeError) {
        console.warn('⚠️ Failed to complete unified transaction:', completeError.message);
      }
    }

    console.log(`✅ Enhanced wallet debit: ₹${amount} for user ${userId}, Unified TX: ${unifiedTransactionId || 'N/A'}`);

    return {
      success: true,
      newBalance: wallet.balance,
      transactionId: walletTransactionId,
      unifiedTransactionId: unifiedTransactionId,
      transaction: wallet.transactions[wallet.transactions.length - 1],
      message: `₹${amount} debited from wallet successfully`
    };
  } catch (error) {
    console.error('Error debiting from wallet:', error);
    throw error;
  }
};

// Handle wallet payment failure with proper rollback
const handleWalletPaymentFailure = async (walletTransactionId, userId, amount, reason, unifiedTransactionId = null) => {
  try {
    console.log(`🔄 Handling wallet payment failure for wallet TX: ${walletTransactionId}`);

    // STEP 1: Mark unified transaction as failed if exists
    if (unifiedTransactionId) {
      try {
        const transactionService = require('./transactionService');
        await transactionService.failTransaction(unifiedTransactionId, reason, 'WALLET_PAYMENT_FAILED');
      } catch (failError) {
        console.warn('⚠️ Failed to mark unified transaction as failed:', failError.message);
      }
    }

    // STEP 2: Restore wallet balance if debit occurred
    if (walletTransactionId) {
      const wallet = await getOrCreateWallet(userId);
      
      // Find and reverse the debit transaction
      const failedTransaction = wallet.transactions.find(t => t.transactionId === walletTransactionId);
      if (failedTransaction && failedTransaction.type === 'debit') {
        
        // Add reversal credit transaction
        const reversalId = `REV${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        wallet.balance += amount; // Restore the amount
        
        wallet.transactions.push({
          transactionId: reversalId,
          type: 'credit',
          amount: amount,
          description: `Reversal: ${reason}`,
          unifiedTransactionId: unifiedTransactionId,
          balanceAfter: wallet.balance,
          status: 'completed'
        });
        
        // Mark original transaction as failed
        failedTransaction.status = 'failed';
        
        // ✅ FIXED: Save without session
        await wallet.save();
        console.log(`✅ Wallet balance restored: +₹${amount}, New balance: ₹${wallet.balance}`);
      }
    }

    return {
      success: true,
      message: 'Wallet payment failure handled successfully',
      balanceRestored: amount
    };

  } catch (error) {
    console.error('❌ Error handling wallet payment failure:', error);
    throw error;
  }
};

// Get wallet reconciliation report
const getWalletReconciliation = async (userId) => {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    // Get all unified transactions for this user
    let unifiedTransactions = [];
    try {
      const transactionService = require('./transactionService');
      const txHistory = await transactionService.getUserTransactionHistory(userId, {
        type: ['WALLET_DEBIT', 'WALLET_CREDIT', 'ORDER_PAYMENT', 'COD_PAYMENT_COMPLETED']
      });
      unifiedTransactions = txHistory.transactions || [];
    } catch (unifiedError) {
      console.warn('⚠️ Failed to get unified transactions for reconciliation:', unifiedError.message);
    }

    // Calculate expected balance from wallet transactions
    let calculatedBalance = 0;
    const walletTransactions = wallet.transactions.filter(t => t.status === 'completed');
    
    walletTransactions.forEach(transaction => {
      if (transaction.type === 'credit') {
        calculatedBalance += transaction.amount;
      } else if (transaction.type === 'debit') {
        calculatedBalance -= transaction.amount;
      }
    });

    const isBalanceMatch = Math.abs(wallet.balance - calculatedBalance) < 0.01;

    return {
      success: true,
      reconciliation: {
        currentBalance: wallet.balance,
        calculatedBalance: calculatedBalance,
        isBalanceMatch: isBalanceMatch,
        difference: wallet.balance - calculatedBalance,
        totalTransactions: wallet.transactions.length,
        completedTransactions: walletTransactions.length,
        unifiedTransactionCount: unifiedTransactions.length,
        lastTransactionDate: walletTransactions.length > 0 ? 
          walletTransactions[walletTransactions.length - 1].date : null
      }
    };

  } catch (error) {
    console.error('❌ Error getting wallet reconciliation:', error);
    throw error;
  }
};

/**
 * Add return refund to user wallet
 * @param {String} userId - User ID
 * @param {Number} amount - Refund amount
 * @param {String} orderId - Order ID
 * @param {String} returnId - Return ID
 * @returns {Object} - Result object
 */
const addReturnRefund = async (userId, amount, orderId, returnId) => {
  try {
    const description = `Return refund for order ${orderId}`;
    const result = await addCredit(userId, amount, description, orderId, returnId, {
      refundType: 'return',
      originalOrderId: orderId
    });
    
    console.log(`Processed return refund of ₹${amount} for user ${userId}, order ${orderId}`);
    
    return {
      ...result,
      message: `Return refund of ₹${amount} processed successfully`
    };
  } catch (error) {
    console.error('Error adding return refund:', error);
    throw error;
  }
};

/**
 * Get wallet balance for a user
 * @param {String} userId - User ID
 * @returns {Object} - Wallet balance and info
 */
const getWalletBalance = async (userId) => {
  console.log(`🔄 walletService.getWalletBalance called with userId: ${userId}`);
  console.time(`getWalletBalance-${userId}`);
  
  try {
    // ✅ CRITICAL FIX: Convert string to ObjectId for proper matching
    const userObjectId = new mongoose.Types.ObjectId(userId);
    console.log(`🔍 Converted userId to ObjectId: ${userObjectId}`);
    
    const wallet = await Wallet.findOne({ userId: userObjectId })
      .select('balance')
      .lean();
    
    console.log(`🔍 Database query result:`, wallet);
    
    if (!wallet) {
      console.log('⚠️ No wallet found, creating new wallet...');
      const newWallet = new Wallet({ 
        userId: userObjectId, // ✅ Use ObjectId here too
        balance: 0, 
        transactions: [] 
      });
      await newWallet.save();
      console.timeEnd(`getWalletBalance-${userId}`);
      return { success: true, balance: 0 };
    }
    
    console.log(`✅ Wallet found with balance: ${wallet.balance}`);
    console.timeEnd(`getWalletBalance-${userId}`);
    return { success: true, balance: wallet.balance };
    
  } catch (error) {
    console.error(`❌ walletService.getWalletBalance error:`, error);
    console.timeEnd(`getWalletBalance-${userId}`);
    throw error;
  }
};


/**
 * Get transaction history with pagination
 * @param {String} userId - User ID
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 * @returns {Object} - Paginated transaction history
 */
const getTransactionHistory = async (userId, page = 1, limit = 10) => {
  console.time(`getTransactionHistory-${userId}`);
  
  try {
    // ✅ CRITICAL FIX: Convert string to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    const result = await Wallet.aggregate([
      { $match: { userId: userObjectId } }, // ✅ Use ObjectId instead of string
      {
        $project: {
          balance: 1,
          totalTransactions: { $size: '$transactions' },
          transactions: {
            $slice: [
              { 
                $sortArray: { 
                  input: '$transactions', 
                  sortBy: { date: -1 } 
                } 
              },
              (page - 1) * limit,
              limit
            ]
          }
        }
      }
    ]);

    const wallet = result[0];
    if (!wallet) {
      console.timeEnd(`getTransactionHistory-${userId}`);
      return {
        success: true,
        transactions: [],
        totalTransactions: 0,
        currentPage: page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      };
    }

    const totalPages = Math.ceil(wallet.totalTransactions / limit);
    
    console.timeEnd(`getTransactionHistory-${userId}`);
    
    return {
      success: true,
      transactions: wallet.transactions || [],
      totalTransactions: wallet.totalTransactions,
      currentPage: parseInt(page),
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
    
  } catch (error) {
    console.timeEnd(`getTransactionHistory-${userId}`);
    throw error;
  }
};


/**
 * Get wallet with user details
 * @param {String} userId - User ID
 * @returns {Object} - Wallet with populated user info
 */
const getWalletWithUserDetails = async (userId) => {
  try {
    const wallet = await Wallet.findOne({ userId }).populate({
      path: 'userId',
      select: 'name email phone role'
    });
    
    if (!wallet) {
      return await getOrCreateWallet(userId);
    }
    
    return wallet;
  } catch (error) {
    console.error('Error getting wallet with user details:', error);
    throw error;
  }
};

/**
 * Transfer money between two users
 * @param {String} fromUserId - Sender user ID
 * @param {String} toUserId - Receiver user ID
 * @param {Number} amount - Transfer amount
 * @param {String} description - Transfer description
 * @returns {Object} - Result object
 */
const transferMoney = async (fromUserId, toUserId, amount, description) => {
  try {
    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than 0');
    }

    if (fromUserId === toUserId) {
      throw new Error('Cannot transfer money to the same user');
    }

    // Validate both users
    const fromUser = await validateUser(fromUserId);
    const toUser = await validateUser(toUserId);
    
    // Check sender has sufficient balance
    const hasSufficient = await hasSufficientBalance(fromUserId, amount);
    if (!hasSufficient) {
      throw new Error('Insufficient balance for transfer');
    }
    
    // ✅ FIXED: Perform operations sequentially without MongoDB transactions
    try {
      // Debit from sender
      await debitAmount(fromUserId, amount, `Transfer to ${toUser.name}: ${description}`);
      
      // Credit to receiver
      await addCredit(toUserId, amount, `Transfer from ${fromUser.name}: ${description}`);
      
      console.log(`Transferred ₹${amount} from user ${fromUserId} to user ${toUserId}`);
      
      return { 
        success: true, 
        message: 'Transfer completed successfully',
        amount: amount,
        fromUserId: fromUserId,
        toUserId: toUserId
      };
    } catch (transferError) {
      // ✅ ENHANCED: If credit fails after debit, attempt to reverse the debit
      console.error('❌ Transfer operation failed, attempting reversal:', transferError);
      
      try {
        await addCredit(fromUserId, amount, `Reversal: Failed transfer to ${toUser.name}`);
        console.log(`✅ Debit amount restored to sender after transfer failure`);
      } catch (reversalError) {
        console.error('❌ CRITICAL: Failed to reverse debit after transfer failure:', reversalError);
        // This would require manual intervention
      }
      
      throw new Error(`Transfer failed: ${transferError.message}`);
    }
  } catch (error) {
    console.error('Error transferring money:', error);
    throw error;
  }
};

/**
 * Get wallet statistics for a user
 * @param {String} userId - User ID
 * @returns {Object} - Wallet statistics
 */
const getWalletStats = async (userId) => {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const totalCredits = wallet.transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDebits = wallet.transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const returnRefunds = wallet.transactions
      .filter(t => t.type === 'credit' && t.returnId)
      .reduce((sum, t) => sum + t.amount, 0);
    
    return {
      success: true,
      currentBalance: wallet.balance,
      totalCredits: totalCredits,
      totalDebits: totalDebits,
      totalReturnRefunds: returnRefunds,
      totalTransactions: wallet.transactions.length,
      walletCreatedAt: wallet.createdAt
    };
  } catch (error) {
    console.error('Error getting wallet stats:', error);
    throw error;
  }
};

/**
 * Check if user has sufficient balance
 * @param {String} userId - User ID
 * @param {Number} amount - Amount to check
 * @returns {Boolean} - Whether user has sufficient balance
 */
const hasSufficientBalance = async (userId, amount) => {
  try {
    const wallet = await getOrCreateWallet(userId);
    return wallet.balance >= amount;
  } catch (error) {
    console.error('Error checking wallet balance:', error);
    return false;
  }
};

/**
 * Get return refund transactions for a user
 * @param {String} userId - User ID
 * @returns {Array} - Return refund transactions
 */
const getReturnRefundTransactions = async (userId) => {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const returnRefunds = wallet.transactions
      .filter(t => t.type === 'credit' && t.returnId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return {
      success: true,
      returnRefunds: returnRefunds,
      totalRefundAmount: returnRefunds.reduce((sum, t) => sum + t.amount, 0),
      totalRefundCount: returnRefunds.length
    };
  } catch (error) {
    console.error('Error getting return refund transactions:', error);
    throw error;
  }
};

// Export all functions
module.exports = {
  validateUser,
  getOrCreateWallet,
  addCredit,
  debitAmount,
  addReturnRefund,
  getWalletBalance,
  getTransactionHistory,
  getWalletWithUserDetails,
  transferMoney,
  getWalletStats,
  hasSufficientBalance,
  getReturnRefundTransactions,
  handleWalletPaymentFailure,
  getWalletReconciliation
};
