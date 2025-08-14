// services/walletService.js
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const mongoose = require('mongoose');

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
    // Validate user exists and is not blocked
    await validateUser(userId);

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = new Wallet({
        userId: userId,
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
const addCredit = async (userId, amount, description, orderId = null, returnId = null) => {
  try {
    if (amount <= 0) {
      throw new Error('Credit amount must be greater than 0');
    }

    const wallet = await getOrCreateWallet(userId);
    const newBalance = wallet.balance + amount;

    // generate unique transaction ID
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    wallet.transactions.push({
      transactionId: transactionId,
      type: 'credit',
      amount: amount,
      description: description,
      orderId: orderId,
      returnId: returnId,
      balanceAfter: newBalance,
      status: 'completed'
    });
    
    wallet.balance = newBalance;
    await wallet.save();

    console.log(`Added ₹${amount} credit to wallet for user ${userId}`);

    return {
      success: true,
      newBalance: wallet.balance,
      transactionId: transactionId,
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
const debitAmount = async (userId, amount, description, orderId = null) => {
  try {
    if (amount <= 0) {
      throw new Error('Debit amount must be greater than 0');
    }

    const wallet = await getOrCreateWallet(userId);
    
    if (wallet.balance < amount) {
      throw new Error('Insufficient wallet balance');
    }
    
    const newBalance = wallet.balance - amount;

    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    wallet.transactions.push({
      type: 'debit',
      transactionId: transactionId,
      amount: amount,
      description: description,
      orderId: orderId,
      balanceAfter: newBalance,
      status: 'completed'
    });
    
    wallet.balance = newBalance;
    await wallet.save();

    console.log(`Debited ₹${amount} from wallet for user ${userId}`);

    return {
      success: true,
      newBalance: wallet.balance,
      transactionId: transactionId,
      transaction: wallet.transactions[wallet.transactions.length - 1],
      message: `₹${amount} debited from wallet successfully`
    };
  } catch (error) {
    console.error('Error debiting from wallet:', error);
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
    const result = await addCredit(userId, amount, description, orderId, returnId);
    
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
  try {
    const wallet = await getOrCreateWallet(userId);
    
    return {
      success: true,
      balance: wallet.balance,
      totalTransactions: wallet.transactions.length,
      lastTransaction: wallet.transactions.length > 0 ? 
        wallet.transactions[wallet.transactions.length - 1] : null
    };
  } catch (error) {
    console.error('Error getting wallet balance:', error);
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
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    const sortedTransactions = wallet.transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(startIndex, endIndex);
    
    return {
      success: true,
      transactions: sortedTransactions,
      totalTransactions: wallet.transactions.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(wallet.transactions.length / limit),
      hasNextPage: endIndex < wallet.transactions.length,
      hasPrevPage: page > 1
    };
  } catch (error) {
    console.error('Error getting transaction history:', error);
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
  const session = await mongoose.startSession();
  session.startTransaction();
  
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
    
    const fromWallet = await getOrCreateWallet(fromUserId);
    
    if (fromWallet.balance < amount) {
      throw new Error('Insufficient balance for transfer');
    }
    
    // Debit from sender
    await debitAmount(fromUserId, amount, `Transfer to ${toUser.name}: ${description}`);
    
    // Credit to receiver
    await addCredit(toUserId, amount, `Transfer from ${fromUser.name}: ${description}`);
    
    await session.commitTransaction();
    
    console.log(`Transferred ₹${amount} from user ${fromUserId} to user ${toUserId}`);
    
    return { 
      success: true, 
      message: 'Transfer completed successfully',
      amount: amount,
      fromUserId: fromUserId,
      toUserId: toUserId
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('Error transferring money:', error);
    throw error;
  } finally {
    session.endSession();
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
  getReturnRefundTransactions
};
