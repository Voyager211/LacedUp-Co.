const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboardController');
const isAdmin = require('../../middlewares/isAdmin');

// Apply admin authentication middleware to all routes
router.use(isAdmin);


// ============================================
// DASHBOARD PAGE RENDER
// ============================================

// Render dashboard page
router.get('/', dashboardController.renderDashboard);

// ============================================
// API ENDPOINTS FOR DASHBOARD ANALYTICS
// ============================================

// Dashboard overview statistics
router.get('/api/stats', dashboardController.getDashboardStats);

// Sales analytics with time periods (monthly/weekly/yearly)
router.get('/api/sales', dashboardController.getSalesData);

// Revenue distribution by payment method
router.get('/api/revenue-distribution', dashboardController.getRevenueDistribution);

// Best selling products (top 5)
router.get('/api/best-selling-products', dashboardController.getBestSellingProducts);

// Best selling category
router.get('/api/best-selling-category', dashboardController.getBestSellingCategory);

// Best selling brand
router.get('/api/best-selling-brand', dashboardController.getBestSellingBrand);

// ============================================
// REPORT GENERATION
// ============================================

// Export ledger report as PDF
router.get('/ledger-report/export-pdf', dashboardController.exportLedgerPDF);

module.exports = router;
