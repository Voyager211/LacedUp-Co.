const express = require('express');
const router = express.Router();
const productController = require('../../controllers/user/product-controller');

// Shop page route (renders the initial page)
router.get('/shop', productController.loadShopPage);

// API route for filtering/searching products (AJAX calls)
router.get('/api/shop', productController.getProducts);

module.exports = router;
