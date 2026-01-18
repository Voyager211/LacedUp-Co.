const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// ===== ORDERS COLLECTION =====
// Get all orders
router.get('/', orderController.getAllOrders);

// ===== UTILITY ENDPOINTS =====
// Get filtered orders (API endpoint for dynamic updates)
router.get('/api/filtered', orderController.getFilteredOrders);
router.get('/api/statistics', orderController.getSystemStatistics);

// ===== ORDER DETAILS =====
// Get specific order details (HTML)
router.get('/:orderId', orderController.getOrderDetails);

// Get order details as JSON (for AJAX calls)
router.get('/api/:orderId', orderController.getOrderDetailsJSON);

// ===== ORDER STATUS MANAGEMENT =====
// Update order status
router.patch('/:orderId', orderController.updateOrderStatus);


// Get allowed status transitions
router.get('/:orderId/transitions', orderController.getAllowedTransitions);

// ===== ORDER-LEVEL ACTIONS =====
// Cancel entire order
router.patch('/:orderId/cancel', orderController.cancelOrder);

// Create return request for entire order
router.patch('/:orderId/return', orderController.returnOrderRequest);

// ===== ITEM-LEVEL ACTIONS =====
// Update individual item status
router.patch('/:orderId/items/:itemId/status', orderController.updateItemStatus);

// Cancel individual item
router.patch('/:orderId/items/:itemId/cancel', orderController.cancelItem);

// Create return request for individual item
router.patch('/:orderId/items/:itemId/return', orderController.returnItemRequest);

// ===== UTILITY FUNCTIONS =====
// Fix payment status for cancelled orders
router.patch('/orders/:orderId/fix-payment-status', orderController.fixCancelledOrderPaymentStatus);

// ===== REPORTING & EXPORT =====
// Get order statistics
router.get('/statistics', orderController.getOrderStatistics);

// Export orders
router.get('/export', orderController.exportOrders);

module.exports = router;
