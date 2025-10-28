const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/user/couponController');


router.get('/available', (req, res) => {
    couponController.getAvailableCoupons(req, res);
});


module.exports = router;
