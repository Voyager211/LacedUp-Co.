const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// ===== ORDERS COLLECTION =====
// Get all orders
router.get('/', orderController.getAllOrders);

// Get specific order details (HTML)
router.get('/:orderId', orderController.getOrderDetails);

// Update order status
router.patch('/:orderId', orderController.updateOrderStatus);

// Update payment status
// router.patch('/:orderId/payment', orderController.updatePaymentStatus);

// Cancel entire order
router.patch('/:orderId/cancel', orderController.cancelOrder);

// Return entire order
router.patch('/:orderId/return', orderController.returnOrder);

// Get allowed status transitions
router.get('/:orderId/transitions', orderController.getAllowedTransitions);

// ===== ORDER ITEMS =====


// Cancel individual item
router.patch('/:orderId/items/:itemId/cancel', orderController.cancelItem);

// Return individual item
router.patch('/:orderId/items/:itemId/return', orderController.returnItem);

// ===== JSON API ENDPOINTS =====
// ✅ FIXED: Get order details as JSON (for AJAX calls)
router.get('/api/:orderId', orderController.getOrderDetailsJSON);

// ===== UTILITY ENDPOINTS =====
// Get filtered orders (API endpoint for dynamic updates)
router.get('/api/filtered', orderController.getFilteredOrders);

// Get order statistics
router.get('/statistics', orderController.getOrderStatistics);

// Export orders
router.get('/export', orderController.exportOrders);

module.exports = router;
