const express = require('express');
const router = express.Router();
const shopController = require('../../controllers/user/shopController');
const ensureVisible = require('../../middlewares/ensure-visible');


// Shop page route (renders the initial page)
router.get('/shop', shopController.loadShopPage);

// API route for filtering/searching products (AJAX calls)
router.get('/api/shop', shopController.getProducts);

// API route for search suggestions dropdown
router.get('/api/search-suggestions', shopController.getSearchSuggestions);

// API route for available sizes
router.get('/api/available-sizes', shopController.getAvailableSizes);

// Product-details page
router.get('/product/:slug', ensureVisible, shopController.loadProductDetails);


module.exports = router;