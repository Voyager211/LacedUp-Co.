const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/adminDashboardController');
const { isAdminAuthenticated } = require('../middleware/adminAuth');

// Apply authentication middleware to all dashboard routes
router.use(isAdminAuthenticated);

// Dashboard statistics
router.get('/api/dashboard/stats', dashboardController.getDashboardStats);

// Sales analytics
router.get('/api/dashboard/sales', dashboardController.getSalesData);

// Revenue distribution
router.get('/api/dashboard/revenue-distribution', dashboardController.getRevenueDistribution);

// Best selling analytics
router.get('/api/dashboard/best-selling-products', dashboardController.getBestSellingProducts);
router.get('/api/dashboard/best-selling-category', dashboardController.getBestSellingCategory);
router.get('/api/dashboard/best-selling-brand', dashboardController.getBestSellingBrand);

// Ledger report
router.get('/ledger-report/export-pdf', dashboardController.exportLedgerPDF);

module.exports = router;
