const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/user/couponController');

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message: 'You must be logged in to access this feature',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  
  return res.redirect('/login');
};



router.get('/', requireAuth, (req, res) => {
    couponController.renderCouponsPage(req, res);
});

router.get('/available', (req, res) => {
    couponController.getAvailableCoupons(req, res);
});


module.exports = router;
