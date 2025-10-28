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

router.get('/validate-checkout-stock', requireAuthAPI, checkoutController.validateCheckoutStock);

// address
router.get('/api/addresses', requireAuthAPI, addressController.getAddresses);

// coupon
router.post('/apply-coupon', requireAuthAPI, couponController.applyCoupon);
router.post('/remove-coupon', requireAuthAPI, couponController.removeCoupon);

// order placement
router.post('/place-order', requireAuthAPI, checkoutController.placeOrderWithValidation);



// order result pages
router.get('/order-success/:orderId', requireAuth, checkoutController.loadOrderSuccess);

module.exports = router;
