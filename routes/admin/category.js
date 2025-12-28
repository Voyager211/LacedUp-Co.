const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

router.get('/', categoryController.listCategories);


router.get('/api', categoryController.apiCategories);
router.get('/api/:id', categoryController.apiGetCategory);
router.post('/api', categoryController.apiCreateCategory);
router.patch('/api/:id', categoryController.apiUpdateCategory);
router.patch('/api/:id/toggle', categoryController.apiToggleStatus);
router.patch('/api/:id/soft-delete', categoryController.apiSoftDeleteCategory);

module.exports = router;