const express = require('express');
const router = express.Router();
const brandController = require('../../controllers/admin/brandController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

// Page render
router.get('/', brandController.listBrands);

// API routes
router.get('/api', brandController.apiBrands);
router.get('/api/:id', brandController.apiGetBrand);
router.post('/api/create', brandController.apiCreateBrand);
router.put('/api/:id', brandController.apiUpdateBrand);
router.patch('/api/:id/toggle', brandController.apiToggleStatus);
router.delete('/api/:id', brandController.apiSoftDeleteBrand);

module.exports = router;
