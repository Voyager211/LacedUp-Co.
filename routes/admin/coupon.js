const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/admin/couponController');
const { requireAuth } = require('../../middlewares/auth');
const isAdmin = require('../../middlewares/isAdmin');

// Apply authentication middleware to all routes
router.use(requireAuth);
router.use(isAdmin);

// ===== STATIC ROUTES FIRST =====
// Get coupon statistics
// router.get('/statistics', couponController.getCouponStatistics);

// ===== COUPON COLLECTION =====
// Get filtered coupons API (for AJAX)
router.get('/api/filtered', couponController.getFilteredCoupons);

// GET /admin/coupons - List all coupons (main page)
router.get('/', couponController.getCoupons);

// POST /admin/coupons - Create new coupon
router.post('/', 
    couponController.couponValidationRules,
    couponController.createCoupon
);

// PATCH /admin/coupons/:couponId/toggle - Toggle coupon status
router.patch('/:couponId/toggle', couponController.toggleCouponStatus);

// DELETE /admin/coupons/:couponId - Delete coupon
router.delete('/:couponId', couponController.deleteCoupon);

module.exports = router;
