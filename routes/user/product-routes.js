const express = require('express');
const router = express.Router();
const productController = require('../../controllers/user/product-controller');
const ensureVisible = require('../../middlewares/ensure-visible');


// Shop page route (renders the initial page)
router.get('/shop', productController.loadShopPage);

// API route for filtering/searching products (AJAX calls)
router.get('/api/shop', productController.getProducts);

// API route for search suggestions dropdown
router.get('/api/search-suggestions', productController.getSearchSuggestions);

// API route for available sizes
router.get('/api/available-sizes', productController.getAvailableSizes);

// Product-details page
router.get('/product/:slug', ensureVisible, productController.loadProductDetails);


module.exports = router;