const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cart-controller');

// Custom authentication middleware for cart routes
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

// Cart page route (regular page, can redirect)
router.get('/', requireAuth, cartController.loadCart);

// API routes (always return JSON)
router.post('/add', requireAuthAPI, cartController.addToCart);
router.post('/update', requireAuthAPI, cartController.updateCartQuantity);
router.post('/remove', requireAuthAPI, cartController.removeFromCart);
router.post('/clear', requireAuthAPI, cartController.clearCart);
router.post('/remove-out-of-stock', requireAuthAPI, cartController.removeOutOfStockItems);

// API route specifically for wishlist-to-cart functionality  
router.post('/add', requireAuthAPI, cartController.addToCart);

// Routes that can be accessed without authentication or with JSON response
router.get('/count', cartController.getCartCount);

// Validation routes
router.get('/validate-stock', requireAuthAPI, cartController.validateCartStock);
router.post('/reset-quantity', requireAuthAPI, cartController.resetCartItemQuantity);

// Checkout route
router.get('/checkout', requireAuth, cartController.loadCheckout);

// Checkout validation route
router.get('/validate-checkout-stock', requireAuthAPI, cartController.validateCheckoutStock);



module.exports = router;