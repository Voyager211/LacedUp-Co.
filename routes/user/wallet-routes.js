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

// Wallet page - with cache disabled
router.get('/profile/wallet', ensureAuthenticated, noCacheMiddleware, walletController.getWallet);

// API endpoints
router.get('/api/wallet/balance', ensureAuthenticated, walletController.getWalletBalance);
router.get('/api/wallet/transactions', ensureAuthenticated, walletController.getTransactions);
router.post('/api/wallet/add-money', ensureAuthenticated, walletController.addMoney);
router.post('/api/wallet/use', ensureAuthenticated, walletController.useWallet);

module.exports = router;