const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/user/checkoutController');
const addressController = require('../../controllers/user/addressController');
const couponController = require('../../controllers/user/couponController');

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'You must be logged in to access this feature',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  return res.redirect('/login');
};

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

// checkout
router.get('/', requireAuth, checkoutController.loadCheckout);

router.get('/wallet-balance', requireAuthAPI, checkoutController.getWalletBalanceForCheckout);
router.get('/validate-checkout-stock', requireAuthAPI, checkoutController.validateCheckoutStock);

// address
router.get('/api/addresses', requireAuthAPI, addressController.getAddresses);

// coupon
router.post('/apply-coupon', requireAuthAPI, couponController.applyCoupon);
router.post('/remove-coupon', requireAuthAPI, couponController.removeCoupon);

// order placement
router.post('/place-order', requireAuthAPI, checkoutController.placeOrderWithValidation);
router.post('/create-transaction', requireAuthAPI, checkoutController.createTransactionForPayment);

// paypal
router.post('/paypal/create-order', requireAuthAPI, checkoutController.createPayPalOrder);
router.post('/paypal/capture/:orderID', requireAuthAPI, checkoutController.capturePayPalOrder);

// razorpay
router.post('/razorpay/create-order', requireAuthAPI, checkoutController.createRazorpayOrder);
router.post('/razorpay/verify-payment', requireAuthAPI, checkoutController.verifyRazorpayPayment);

// payment failure
router.post('/handle-payment-failure', requireAuthAPI, checkoutController.handlePaymentFailure);

// retry payment
router.post('/retry-payment/:transactionId', requireAuthAPI, checkoutController.retryPayment);
router.post('/retry-wallet-payment', requireAuthAPI, checkoutController.retryWalletPayment);

router.get('/retry-payment/:transactionId', requireAuth, checkoutController.loadRetryPaymentPage);

// order result pages
router.get('/order-success/:orderId', requireAuth, checkoutController.loadOrderSuccess);

router.get('/order-failure', requireAuth, checkoutController.loadOrderFailure);  
router.get('/order-failure/:transactionId', requireAuth, checkoutController.loadOrderFailure);

module.exports = router;
