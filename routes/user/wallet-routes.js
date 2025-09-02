const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/user/walletController');
const { ensureAuthenticated } = require('../../middlewares/user-middleware');

// ✅ Cache control middleware - prevents 304 caching
const noCacheMiddleware = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

// ✅ WALLET PAGE ROUTES
// Wallet page - with cache disabled
router.get('/profile/wallet', ensureAuthenticated, noCacheMiddleware, walletController.getWallet);

// ✅ EXISTING WALLET API ENDPOINTS
router.get('/api/wallet/balance', ensureAuthenticated, walletController.getWalletBalance);
router.get('/api/wallet/transactions', ensureAuthenticated, walletController.getTransactions);
router.get('/api/wallet/transactions/paginated', ensureAuthenticated, walletController.getTransactionsPaginated);
router.post('/api/wallet/add-money', ensureAuthenticated, walletController.addMoney);
router.post('/api/wallet/use', ensureAuthenticated, walletController.useWallet);

// ✅ NEW: Enhanced wallet routes with unified transaction integration
router.get('/api/wallet/reconciliation', ensureAuthenticated, walletController.getWalletReconciliation);

// ✅ NEW: Wallet top-up payment gateway routes
router.post('/api/wallet/topup/create-order', ensureAuthenticated, walletController.createWalletTopUpOrder);
router.post('/api/wallet/topup/verify-razorpay', ensureAuthenticated, walletController.verifyWalletTopUpPayment);
router.post('/api/wallet/topup/capture-paypal', ensureAuthenticated, walletController.captureWalletTopUpPayment);

module.exports = router;
