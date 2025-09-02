const transactionService = require('../../services/transactionService');
const User = require('../../models/User');

/**
 * Get user transaction history
 */
exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const type = req.query.type;
    
    const skip = (page - 1) * limit;

    const result = await transactionService.getUserTransactionHistory(userId, {
      limit,
      skip,
      status,
      type
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalCount: result.totalCount,
          limit: limit
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting user transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction history'
    });
  }
};

/**
 * Get transaction details by ID
 */
exports.getTransactionDetails = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { transactionId } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await transactionService.getTransaction(transactionId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    // Check if transaction belongs to user
    if (result.transaction.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      transaction: result.transaction
    });

  } catch (error) {
    console.error('❌ Error getting transaction details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction details'
    });
  }
};

/**
 * Cancel pending transaction (for user-cancelled payments)
 */
exports.cancelTransaction = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { transactionId } = req.params;
    const { reason } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get transaction first to verify ownership
    const getResult = await transactionService.getTransaction(transactionId);
    
    if (!getResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check ownership
    if (getResult.transaction.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Cancel transaction
    const result = await transactionService.cancelTransaction(
      transactionId, 
      reason || 'Cancelled by user'
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Transaction cancelled successfully',
      transaction: result.transaction
    });

  } catch (error) {
    console.error('❌ Error cancelling transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel transaction'
    });
  }
};

/**
 * Get transaction statistics for user
 */
exports.getTransactionStats = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get all user transactions for stats
    const allTransactions = await transactionService.getUserTransactionHistory(userId, {
      limit: 1000,
      skip: 0
    });

    if (!allTransactions.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get transaction statistics'
      });
    }

    const transactions = allTransactions.transactions;

    // Calculate statistics
    const stats = {
      total: transactions.length,
      completed: transactions.filter(t => t.status === 'COMPLETED').length,
      failed: transactions.filter(t => t.status === 'FAILED').length,
      pending: transactions.filter(t => ['INITIATED', 'PENDING', 'PROCESSING'].includes(t.status)).length,
      cancelled: transactions.filter(t => t.status === 'CANCELLED').length,
      totalAmount: transactions
        .filter(t => t.status === 'COMPLETED' && t.type === 'ORDER_PAYMENT')
        .reduce((sum, t) => sum + t.amount, 0),
      paymentMethods: {}
    };

    // Payment method breakdown
    transactions.forEach(t => {
      if (t.status === 'COMPLETED') {
        stats.paymentMethods[t.paymentMethod] = (stats.paymentMethods[t.paymentMethod] || 0) + 1;
      }
    });

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Error getting transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction statistics'
    });
  }
};
