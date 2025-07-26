const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/user/orderController');

// Custom authentication middleware
const requireAuth = (req, res, next) => {
  // Check both session.userId and req.user (Passport.js)
  if (req.isAuthenticated() || req.session.userId) {
    return next();
  }
  
  // For AJAX requests, return JSON error
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  // For regular requests, redirect to login
  req.flash('error', 'Please log in to continue');
  res.redirect('/login');
};

// Place order
router.post('/place-order', requireAuth, orderController.placeOrder);

// Order success page
router.get('/order-success/:orderId', requireAuth, orderController.loadOrderSuccess);

// Get all orders for user
router.get('/orders', requireAuth, orderController.getUserOrders);

module.exports = router;