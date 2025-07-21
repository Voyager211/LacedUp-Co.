const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/user/cart-controller');

// Custom authentication middleware for cart routes
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.redirect('/login');
};

// Apply user authentication middleware to all cart routes
router.use(requireAuth);

// Cart page route
router.get('/', cartController.loadCart);

// Add to cart
router.post('/add', cartController.addToCart);

// Get cart count (for navbar)
router.get('/count', cartController.getCartCount);

// Update cart item quantity
router.post('/update', cartController.updateCartQuantity);

// Remove item from cart
router.post('/remove', cartController.removeFromCart);

// Clear entire cart
router.post('/clear', cartController.clearCart);

// Remove out-of-stock items
router.post('/remove-out-of-stock', cartController.removeOutOfStockItems);

// Validate cart items
router.get('/validate', cartController.validateCartItems);

module.exports = router;