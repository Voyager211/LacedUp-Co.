const express = require('express');
const router = express.Router();
const helpController = require('../../controllers/user/helpController');

// GET Help Page
router.get('/', helpController.getHelpPage);

// POST Contact Form
router.post('/contact', helpController.submitContactForm);

module.exports = router;
