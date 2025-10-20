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
router.get('/', requireAuth, transactionController.getUserTransactions);

// Get specific transaction details
router.get('/:transactionId', requireAuth, transactionController.getTransactionDetails);

// Cancel pending transaction
router.patch('/:transactionId/cancel', requireAuth, transactionController.cancelTransaction);

// Get user transaction statistics
router.get('/stats/summary', requireAuth, transactionController.getTransactionStats);

router.post('/create-order-transaction', requireAuth, transactionController.createOrderTransaction);


module.exports = router;
