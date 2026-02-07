const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middlewares/auth'); 
const homeController = require('../../controllers/user/homeController');

router.get('/home', isAuthenticated, homeController.getHome); 

module.exports = router;
