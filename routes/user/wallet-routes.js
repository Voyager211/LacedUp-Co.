const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/user/walletController');
const { ensureAuthenticated } = require('../../middlewares/user-middleware');

// Get wallet page
router.get('/profile/wallet', ensureAuthenticated, walletController.getWallet);

// API routes
router.get('/api/wallet/balance', ensureAuthenticated, walletController.getWalletBalance);
router.get('/api/wallet/transactions', ensureAuthenticated, walletController.getTransactionHistory);
router.post('/api/wallet/use-for-payment', ensureAuthenticated, walletController.useWalletForPayment);
router.post('/api/wallet/add-money', ensureAuthenticated, walletController.addMoneyToWallet);

module.exports = router;