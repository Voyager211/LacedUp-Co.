const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const isAdmin = require('../../middlewares/isAdmin');
const multer = require('multer');
const upload = multer();
 
// Admin route protection
router.use(isAdmin);


// 1. API Routes - Most Specific (MUST BE FIRST)
router.get('/api', productController.apiProducts);
router.post('/api/add', upload.none(), productController.apiSubmitNewProduct);
router.patch('/api/:id', upload.none(), productController.apiUpdateProduct);
router.patch('/api/:id/delete', productController.apiSoftDeleteProduct);
router.patch('/api/:id/toggle', productController.apiToggleProductStatus);

// 2. Static Page Routes (specific paths)
router.get('/add', productController.renderAddPage);

// 3. Dynamic Page Routes (with :id parameter - MUST BE LAST)
router.get('/:id/edit', productController.renderEditPage);
router.get('/:id', productController.renderDetailPage);

// 4. List Page (can be anywhere, but conventionally at top or bottom)
router.get('/', productController.listProducts);

module.exports = router;
