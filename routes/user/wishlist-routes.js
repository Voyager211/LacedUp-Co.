const express = require('express');
const router = express.Router();
const wishlistController = require('../../controllers/user/wishlistController');
const { ensureAuthenticated } = require('../../middlewares/user-middleware');

// Get wishlist page
router.get('/', ensureAuthenticated, wishlistController.getWishlist);

// Add product to wishlist
router.post('/add', ensureAuthenticated, wishlistController.addToWishlist);

// Remove product from wishlist
router.delete('/remove/:productId', ensureAuthenticated, wishlistController.removeFromWishlist);

// Search wishlist products
router.get('/search', ensureAuthenticated, wishlistController.searchWishlist);

module.exports = router;