const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

router.get('/', categoryController.listCategories);

// router.post('/', categoryController.createCategory);
// router.post('/:id/toggle', categoryController.toggleCategoryStatus);
// router.put('/:id', categoryController.updateCategory); // ✅ matches method override from EJS
// router.patch('/soft-delete/:id', categoryController.softDeleteCategory);

router.get('/api', categoryController.apiCategories);
router.post('/api', categoryController.apiCreateCategory);
router.patch('/api/:id', categoryController.apiUpdateCategory);
router.patch('/api/:id/toggle', categoryController.apiToggleStatus);
router.patch('/api/:id/soft-delete', categoryController.apiSoftDeleteCategory);

module.exports = router;