const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middlewares/auth'); // ✅ correct import
const homeController = require('../../controllers/user/homeController');

router.get('/home', isAuthenticated, homeController.getHome); // ✅ correct middleware

module.exports = router;
