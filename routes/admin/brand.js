const express = require('express');
const router = express.Router();
const brandController = require('../../controllers/admin/brandController');
const isAdmin = require('../../middlewares/isAdmin');

// Admin route protection
router.use(isAdmin);

router.get('/', brandController.listBrands);

router.get('/api', brandController.apiBrands);
router.post('/api', brandController.apiCreateBrand);
router.patch('/api/:id', brandController.apiUpdateBrand);
router.patch('/api/:id/toggle', brandController.apiToggleStatus);
router.patch('/api/:id/soft-delete', brandController.apiSoftDeleteBrand);

module.exports = router;