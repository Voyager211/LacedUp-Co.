const express = require('express');
const router = express.Router();
const landingController = require('../../controllers/user/landingController');

router.get('/', landingController.showLanding);

module.exports = router;
