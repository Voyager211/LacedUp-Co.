const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const isAdmin = require('../../middlewares/isAdmin');
const multer = require('multer');
const upload = multer();

// Admin route protection
router.use(isAdmin);

// Web page rendering
router.get('/', productController.listProducts);
router.get('/add', productController.renderAddPage);
router.get('/:id/edit', productController.renderEditPage);
// router.patch('/:id/delete', productController.softDeleteProduct);

// Fetch-based API routes
router.get('/api', productController.apiProducts);
router.post('/api/add', upload.none(), productController.apiSubmitNewProduct);
// router.post('/api/edit/:id', isAdmin, upload.none(), productController.apiUpdateProduct);
router.patch('/api/:id', upload.none(), productController.apiUpdateProduct);
router.patch('/api/:id/delete', productController.apiSoftDeleteProduct);
router.patch('/api/:id/toggle', productController.apiToggleProductStatus);

module.exports = router;
