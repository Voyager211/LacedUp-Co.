const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/user/orderController');

// Custom authentication middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated() || req.session.userId) {
    return next();
  }
  
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  req.flash('error', 'Please log in to continue');
  res.redirect('/login');
};


// Create new order
router.post('/orders', requireAuth, orderController.placeOrderWithValidation);

// Get all orders for user
router.get('/orders', requireAuth, orderController.getUserOrders);

// Get specific order details
router.get('/orders/:orderId', requireAuth, orderController.getOrderDetails);

// Update order (cancel)
router.patch('/orders/:orderId', requireAuth, orderController.cancelOrder);

// ===== ORDER ITEMS =====
// Update specific item in order (cancel item)
router.patch('/orders/:orderId/items/:itemId', requireAuth, orderController.cancelItem);

// Create return request for entire order
router.post('/orders/:orderId/returns', requireAuth, orderController.requestOrderReturn);

// Create return request for specific item
router.post('/orders/:orderId/items/:itemId/returns', requireAuth, orderController.requestItemReturn);

// ===== UTILITY ROUTES =====
// Order success page (UI-specific)
router.get('/order-success/:orderId', requireAuth, orderController.loadOrderSuccess);

// Download invoice (action on resource)
router.get('/orders/:orderId/invoice', requireAuth, orderController.downloadInvoice);

module.exports = router;
