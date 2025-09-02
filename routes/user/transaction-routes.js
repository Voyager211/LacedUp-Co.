const express = require('express');
const router = express.Router();
const transactionController = require('../../controllers/user/transactionController');

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated() || req.session.userId) {
    return next();
  }
  
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  req.flash('error', 'Please log in to continue');
  res.redirect('/login');
};

/**
 * Transaction Routes
 */

// Get user transaction history
router.get('/transactions', requireAuth, transactionController.getUserTransactions);

// Get specific transaction details
router.get('/transactions/:transactionId', requireAuth, transactionController.getTransactionDetails);

// Cancel pending transaction
router.patch('/transactions/:transactionId/cancel', requireAuth, transactionController.cancelTransaction);

// Get user transaction statistics
router.get('/transactions/stats/summary', requireAuth, transactionController.getTransactionStats);

module.exports = router;
