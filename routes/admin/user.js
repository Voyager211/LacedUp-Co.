const express = require('express');
const router = express.Router();
const userController = require('../../controllers/admin/userController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// Standard user list
router.get('/', userController.listUsers);

// API endpoint for fetch-based dynamic list
router.get('/api', userController.apiUsers);

// PATCH-based block/unblock (used by fetch)
router.patch('/:id/block', userController.apiBlockUser);
router.patch('/:id/unblock', userController.apiUnblockUser);

module.exports = router;
