const express = require('express');
const router = express.Router();
const aboutController = require('../../controllers/user/aboutController');

router.get('/', aboutController.getAbout);

module.exports = router;
