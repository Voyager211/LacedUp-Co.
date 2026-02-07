const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboardController');
const isAdmin = require('../../middlewares/isAdmin');

// Apply admin authentication middleware to all routes
router.use(isAdmin);


// DASHBOARD PAGE RENDER


// Render dashboard page
router.get('/', dashboardController.renderDashboard);


// API ENDPOINTS FOR DASHBOARD ANALYTICS


// Dashboard overview statistics
router.get('/api/stats', dashboardController.getDashboardStats);

// Sales analytics with time periods (monthly/weekly/yearly)
router.get('/api/sales', dashboardController.getSalesData);

// Revenue distribution by payment method
router.get('/api/revenue-distribution', dashboardController.getRevenueDistribution);

//  Best selling products (supports limit parameter)
router.get('/api/best-selling-products', dashboardController.getBestSellingProducts);

//  Best selling categories (top 10)
router.get('/api/best-selling-categories', dashboardController.getBestSellingCategories);

//  Best selling brands (top 10)
router.get('/api/best-selling-brands', dashboardController.getBestSellingBrands);


// BACKWARDS COMPATIBILITY (OPTIONAL)


//  Keep old endpoints for backwards compatibility (return first item from list)
router.get('/api/best-selling-category', dashboardController.getBestSellingCategory);
router.get('/api/best-selling-brand', dashboardController.getBestSellingBrand);


// REPORT GENERATION


// Export ledger report as PDF
router.get('/ledger-report/export-pdf', dashboardController.exportLedgerPDF);

module.exports = router;
