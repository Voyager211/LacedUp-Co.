const express = require('express');
const router = express.Router();
const returnController = require('../../controllers/admin/returnController');
const isAdmin = require('../../middlewares/isAdmin');

// Apply admin middleware to all routes
router.use(isAdmin);

// ===== STATIC ROUTES FIRST =====
// Get return statistics
router.get('/statistics', returnController.getReturnStatistics);

// Export returns data
router.get('/export', returnController.exportReturns);

// ===== RETURN COLLECTION =====
// Get all return requests
router.get('/api/filtered', returnController.getReturnsAPI);
router.get('/', returnController.getAllReturns);


// Get return details
// router.get('/:returnId', returnController.getReturnDetails);

// Approve individual return request
router.patch('/:returnId/approve', returnController.approveReturn);

// Reject individual return request
router.patch('/:returnId/reject', returnController.rejectReturn);

// ===== BULK ORDER OPERATIONS (NEW - MISSING ROUTES) =====
// Approve all return requests for an order
router.patch('/orders/:orderId/approve', returnController.approveOrderReturn);

// Reject all return requests for an order
router.patch('/orders/:orderId/reject', returnController.rejectOrderReturn);

module.exports = router;
