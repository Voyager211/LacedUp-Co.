const express = require('express');
const router = express.Router();
const nocache = require('../../middlewares/nocache');
const landingController = require('../../controllers/user/landingController');

router.get('/', nocache, landingController.showLanding);

module.exports = router;
