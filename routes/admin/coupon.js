const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/admin/couponController');
const { requireAuth } = require('../../middlewares/auth');
const isAdmin = require('../../middlewares/isAdmin');

// Apply authentication middleware to all routes
router.use(requireAuth);
router.use(isAdmin);

// API routes
router.get('/api', couponController.getAllCouponsAPI);
router.patch('/api/:id/toggle', couponController.toggleCouponStatus);
router.delete('/api/:id', couponController.deleteCoupon);


router.get('/', couponController.loadCouponPage);
router.get('/:id', couponController.getCouponById)



// CRUD
router.post('/create', couponController.createCoupon);
router.put('/:id', couponController.updateCoupon);


module.exports = router;
