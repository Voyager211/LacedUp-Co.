const express = require('express');
const router = express.Router();
const salesReportController = require('../../controllers/admin/salesReportController');
const isAdmin = require('../../middlewares/isAdmin');

router.use(isAdmin);

// ===== SALES REPORT =====
router.get('/', salesReportController.getSalesReport);
router.get('/export-pdf', salesReportController.exportPDF);
router.get('/export-excel', salesReportController.exportExcel);

module.exports = router;