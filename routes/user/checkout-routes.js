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


// ========== CHECKOUT PAGE ==========
router.get('/', requireAuth, checkoutController.loadCheckout);
router.get('/validate-checkout-stock', requireAuthAPI, checkoutController.validateCheckoutStock);


// ========== ADDRESS ==========
router.get('/api/addresses', requireAuthAPI, addressController.getAddresses);


// ========== COUPON ==========
router.post('/apply-coupon', requireAuthAPI, couponController.applyCoupon);
router.post('/remove-coupon', requireAuthAPI, couponController.removeCoupon);


// ========== ORDER PLACEMENT ==========
router.post('/place-order', requireAuthAPI, checkoutController.placeOrderWithValidation);


// ========== RAZORPAY - NEW ORDER PAYMENT ==========
router.post('/create-razorpay-order', requireAuthAPI, checkoutController.createRazorpayPayment);
router.post('/verify-razorpay-payment', requireAuthAPI, checkoutController.verifyRazorpayPayment);
router.post('/payment-failure', requireAuthAPI, checkoutController.handlePaymentFailure);


// ========== ORDER SUCCESS/FAILURE PAGES ==========
router.get('/order-success/:orderId', requireAuth, checkoutController.loadOrderSuccess);
router.get('/order-failure/:transactionId', requireAuth, checkoutController.loadOrderFailure);


// ========== RAZORPAY - RETRY PAYMENT ==========
router.get('/retry-payment/:transactionId', requireAuth, checkoutController.loadRetryPaymentPage);
router.post('/create-razorpay-order-retry', requireAuthAPI, checkoutController.createRazorpayOrderForRetry);
router.post('/verify-retry-razorpay-payment', requireAuthAPI, checkoutController.verifyRetryRazorpayPayment);
router.post('/retry-payment-failure', requireAuthAPI, checkoutController.handleRetryPaymentFailure);


module.exports = router;
