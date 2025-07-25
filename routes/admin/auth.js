const express = require ('express');
const router = express.Router();
const nocache = require('../../middlewares/nocache');
const passport = require('passport');
const isAdmin = require('../../middlewares/isAdmin');
const authController = require('../../controllers/admin/authController');
const dashboardController = require('../../controllers/admin/dashboardController');


router.get('/login', nocache, authController.getLogin);
router.post('/login', authController.postLogin);

router.get('/dashboard', isAdmin, dashboardController.getDashboard);
router.get('/logout', authController.logout);

module.exports = router;