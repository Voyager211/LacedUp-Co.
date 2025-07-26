const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// Get all orders
router.get('/', orderController.getAllOrders);

// Get order details
router.get('/details/:orderId', orderController.getOrderDetails);

// Update order status
router.put('/status/:orderId', orderController.updateOrderStatus);

// Get allowed status transitions
router.get('/transitions/:orderId', orderController.getAllowedTransitions);

// Update payment status
router.put('/payment/:orderId', orderController.updatePaymentStatus);

// Update individual item status
router.put('/item-status/:orderId/:itemId', orderController.updateItemStatus);

// Cancel individual item
router.put('/cancel-item/:orderId/:itemId', orderController.cancelItem);

// Return individual item
router.put('/return-item/:orderId/:itemId', orderController.returnItem);

// Get order statistics
router.get('/statistics', orderController.getOrderStatistics);

// Export orders
router.get('/export', orderController.exportOrders);

module.exports = router;