const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/user/checkoutController');
const addressController = require('../../controllers/user/addressController');

// Custom authentication middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // For AJAX requests, return JSON response instead of redirect
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'You must be logged in to access this feature',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  // For regular requests, redirect to login
  return res.redirect('/login');
};

// Custom authentication middleware for API routes (always returns JSON)
const requireAuthAPI = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  return res.status(401).json({
    success: false,
    message: 'You must be logged in to access this feature',
    code: 'AUTHENTICATION_REQUIRED'
  });
};

// ===== CHECKOUT PAGE =====
router.get('/', requireAuth, checkoutController.loadCheckout);

// ===== CHECKOUT API ROUTES =====
router.get('/wallet-balance', requireAuthAPI, checkoutController.getWalletBalanceForCheckout);
router.get('/validate-checkout-stock', requireAuthAPI, checkoutController.validateCheckoutStock);

// Address API for checkout
router.get('/api/addresses', requireAuthAPI, addressController.getAddresses);

// Coupon management routes
router.post('/apply-coupon', checkoutController.applyCoupon);
router.post('/remove-coupon', checkoutController.removeCoupon);

// ===== ORDER PLACEMENT =====
router.post('/place-order', requireAuthAPI, checkoutController.placeOrderWithValidation);
router.post('/create-transaction', requireAuthAPI, checkoutController.createTransactionForPayment);

// ===== PAYPAL PAYMENT ROUTES =====
router.post('/paypal/create-order', requireAuthAPI, checkoutController.createPayPalOrder);
router.post('/paypal/capture/:orderID', requireAuthAPI, checkoutController.capturePayPalOrder);

// ===== RAZORPAY PAYMENT ROUTES =====
router.post('/razorpay/create-order', requireAuthAPI, checkoutController.createRazorpayOrder);
router.post('/razorpay/verify-payment', requireAuthAPI, checkoutController.verifyRazorpayPayment);

// ===== PAYMENT FAILURE HANDLING =====
router.post('/handle-payment-failure', requireAuthAPI, checkoutController.handlePaymentFailure);

// ===== PAYMENT RETRY ROUTES =====
router.post('/retry-payment/:transactionId', requireAuthAPI, checkoutController.retryPayment);
router.post('/retry-wallet-payment', requireAuthAPI, checkoutController.retryWalletPayment);

// ===== ORDER RESULT PAGES =====
router.get('/order-success/:orderId', requireAuth, checkoutController.loadOrderSuccess);

// ✅ ENHANCED: Updated order failure routes to handle both orderId and transactionId
router.get('/order-failure', requireAuth, checkoutController.loadOrderFailure);  
router.get('/order-failure/:transactionId', requireAuth, checkoutController.loadOrderFailure);

module.exports = router;
