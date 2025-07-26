const express = require('express');
const router = express.Router();
const returnController = require('../../controllers/admin/returnController');
const isAdmin = require('../../middlewares/isAdmin');

// Apply admin middleware to all routes
router.use(isAdmin);

// Get all return requests
router.get('/', returnController.getAllReturns);

// Get return details (API endpoint)
router.get('/details/:returnId', returnController.getReturnDetails);

// Approve return request
router.put('/approve/:returnId', returnController.approveReturn);

// Reject return request
router.put('/reject/:returnId', returnController.rejectReturn);

// Process refund
router.put('/process-refund/:returnId', returnController.processRefund);

// Update return status
router.put('/update-status/:returnId', returnController.updateReturnStatus);

// Get return statistics
router.get('/statistics', returnController.getReturnStatistics);

// Export returns data
router.get('/export', returnController.exportReturns);

module.exports = router;