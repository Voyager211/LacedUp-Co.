const express = require('express');
const router = express.Router();
const reviewController = require('../../controllers/user/reviewController');
const { isAuthenticated } = require('../../middlewares/auth');

// Submit a new review (requires authentication)
router.post('/api/reviews', reviewController.uploadReviewImages, reviewController.submitReview);

// Get reviews for a product (public)
router.get('/api/reviews/:productId', reviewController.getProductReviews);

module.exports = router;
