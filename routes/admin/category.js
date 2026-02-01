const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// Page render
router.get('/', categoryController.listCategories);

// API routes
router.get('/api', categoryController.apiCategories);
router.get('/api/:id', categoryController.apiGetCategory);
router.post('/api/create', categoryController.apiCreateCategory);
router.put('/api/:id', categoryController.apiUpdateCategory);
router.patch('/api/:id/toggle', categoryController.apiToggleStatus);
router.delete('/api/:id', categoryController.apiSoftDeleteCategory);

module.exports = router;
