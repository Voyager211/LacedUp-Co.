const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/user/walletController');

// ========== AUTHENTICATION MIDDLEWARES ==========
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated() || req.session.userId) {
    return next();
  }

  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'You must be logged in to access this feature',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }

  req.flash('error', 'Please log in to continue');
  return res.redirect('/login');
};

// ========== WALLET PAGE ==========
// Render wallet page with sidebar (GET /wallet)
router.get('/', requireAuth, walletController.renderWalletPage);

// ========== WALLET API ENDPOINTS - ✅ CLEANED: No duplicate /wallet in paths ==========
// GET /wallet/balance
router.get('/balance', requireAuth, walletController.getWalletBalance);

// GET /wallet/transactions/paginated?page=1
router.get('/transactions/paginated', requireAuth, walletController.getPaginatedTransactionsAPI);

// GET /wallet/stats
router.get('/stats', requireAuth, walletController.getWalletStatsAPI);

// GET /wallet/transaction/:transactionId
router.get('/transaction/:transactionId', requireAuth, walletController.getTransaction);

// ========== ADD MONEY TO WALLET ==========
// POST /wallet/add-money
router.post('/add-money', requireAuth, walletController.addMoney);

// ========== RAZORPAY - WALLET TOP-UP ==========
// POST /wallet/topup/create-order
router.post('/topup/create-order', requireAuth, walletController.createRazorpayOrder);

// POST /wallet/topup/verify-razorpay
router.post('/topup/verify-razorpay', requireAuth, walletController.verifyRazorpayPayment);

// ========== WALLET DEBIT (FOR ORDERS) ==========
// POST /wallet/debit
router.post('/debit', requireAuth, walletController.debitWallet);

module.exports = router;
