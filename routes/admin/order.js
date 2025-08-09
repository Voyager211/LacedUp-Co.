const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// ===== ORDERS COLLECTION =====
// Get all orders
router.get('/', orderController.getAllOrders);  // ✅ CHANGED: /orders → /

// Get specific order details  
router.get('/:orderId', orderController.getOrderDetails);  // ✅ CHANGED: /orders/:orderId → /:orderId

// Update order status
router.patch('/:orderId', orderController.updateOrderStatus);  // ✅ CHANGED: /orders/:orderId → /:orderId

// Update payment status
router.patch('/:orderId/payment', orderController.updatePaymentStatus);  // ✅ CHANGED: /orders/:orderId/payment → /:orderId/payment

// Cancel entire order
router.patch('/:orderId/cancel', orderController.cancelOrder);  // ✅ CHANGED: /orders/:orderId/cancel → /:orderId/cancel

// Return entire order
router.patch('/:orderId/return', orderController.returnOrder);  // ✅ CHANGED: /orders/:orderId/return → /:orderId/return

// Get allowed status transitions
router.get('/:orderId/transitions', orderController.getAllowedTransitions);  // ✅ CHANGED: /orders/:orderId/transitions → /:orderId/transitions

// ===== ORDER ITEMS =====
// Update item status
router.patch('/:orderId/items/:itemId', orderController.updateItemStatus);  // ✅ CHANGED: /orders/:orderId/items/:itemId → /:orderId/items/:itemId

// Cancel individual item
router.patch('/:orderId/items/:itemId/cancel', orderController.cancelItem);  // ✅ CHANGED: /orders/:orderId/items/:itemId/cancel → /:orderId/items/:itemId/cancel

// Return individual item
router.patch('/:orderId/items/:itemId/return', orderController.returnItem);  // ✅ CHANGED: /orders/:orderId/items/:itemId/return → /:orderId/items/:itemId/return

// ===== UTILITY ENDPOINTS =====
// Get filtered orders (API endpoint for dynamic updates)
router.get('/api/filtered', orderController.getFilteredOrders);  // ✅ CHANGED: /orders/api/filtered → /api/filtered

// Get order statistics
router.get('/statistics', orderController.getOrderStatistics);  // ✅ CHANGED: /orders/statistics → /statistics

// Export orders
router.get('/export', orderController.exportOrders);  // ✅ CHANGED: /orders/export → /export

module.exports = router;
