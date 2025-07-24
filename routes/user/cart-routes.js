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

// Routes that can be accessed without authentication or with JSON response
router.get('/count', cartController.getCartCount);

// Checkout route
router.get('/checkout', requireAuth, cartController.loadCheckout);

module.exports = router;