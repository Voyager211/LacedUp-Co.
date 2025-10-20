console.log('🎫 Coupon route file loaded!');

const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/user/couponController');

console.log('✅ Coupon controller:', typeof couponController.getAvailableCoupons);

// Define the route
router.get('/available', (req, res) => {
    console.log('🚀 /coupons/available route HIT!');
    couponController.getAvailableCoupons(req, res);
});

console.log('✅ Route registered on router');



// At the bottom of routes/user/coupon-routes.js
console.log('📋 Router stack:', router.stack.map(layer => ({
    route: layer.route?.path,
    methods: Object.keys(layer.route?.methods || {})
})));

module.exports = router;

console.log('✅ Router exported');