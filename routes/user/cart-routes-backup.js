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
  console.log('Cart API Auth Check:', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user ? req.user._id : null,
    sessionUserId: req.session ? req.session.userId : null,
    headers: {
      'content-type': req.headers['content-type'],
      'accept': req.headers['accept'],
      'x-requested-with': req.headers['x-requested-with']
    }
  });
  
  if (req.isAuthenticated()) {
    return next();
  }
  
  console.log('Authentication failed, returning 401');
  return res.status(401).json({
    success: false,
    message: 'You must be logged in to access this feature',
    code: 'AUTHENTICATION_REQUIRED'
  });
};

// Cart page route (regular page, can redirect)
router.get('/', requireAuth, cartController.loadCart);

// API routes (always return JSON) - temporarily bypass auth for debugging
router.post('/add', (req, res, next) => {
  console.log('=== CART ADD ROUTE HIT ===');
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  console.log('User authenticated:', req.isAuthenticated());
  console.log('User object:', req.user);
  console.log('Session:', req.session);
  
  // Temporary test response
  console.log('Sending test response...');
  return res.json({
    success: true,
    message: 'Test response - cart functionality temporarily disabled for debugging',
    data: req.body,
    cartCount: 1
  });
});

router.post('/update', requireAuthAPI, cartController.updateCartQuantity);
router.post('/remove', requireAuthAPI, cartController.removeFromCart);
router.post('/clear', requireAuthAPI, cartController.clearCart);
router.post('/remove-out-of-stock', requireAuthAPI, cartController.removeOutOfStockItems);

// Routes that can be accessed without authentication or with JSON response
router.get('/count', cartController.getCartCount);
router.get('/validate', cartController.validateCartItems);

module.exports = router;