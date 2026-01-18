const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middlewares/auth');
const referralController = require('../../controllers/user/referralController');

// GET /referrals - View referrals page
router.get('/', isAuthenticated, referralController.getReferralsPage);

module.exports = router;
