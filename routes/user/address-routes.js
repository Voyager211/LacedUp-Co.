const express = require('express');
const router = express.Router();
const addressController = require('../../controllers/user/addressController');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  // Check both session.userId and req.user (Passport.js)
  const userId = req.session.userId || (req.user && req.user._id);
  
  if (!userId) {
    return res.redirect('/login');
  }
  
  // Store userId in session if it's from req.user
  if (!req.session.userId && req.user) {
    req.session.userId = req.user._id;
  }
  
  next();
};

// Page routes
router.get('/addresses', requireAuth, addressController.loadAddresses);
router.get('/address/add', requireAuth, addressController.loadAddAddress);
router.get('/address/edit/:addressId', requireAuth, addressController.loadEditAddress);

// API routes
router.get('/api/addresses', requireAuth, addressController.getAddresses);
router.post('/api/address', requireAuth, addressController.addAddress);
router.get('/api/address/:addressId', requireAuth, addressController.getAddress);
router.put('/api/address/:addressId', requireAuth, addressController.updateAddress);
router.delete('/api/address/:addressId', requireAuth, addressController.deleteAddress);
router.patch('/api/address/:addressId/default', requireAuth, addressController.setDefaultAddress);

// States and districts data
router.get('/api/states-districts', addressController.getStatesAndDistricts);

module.exports = router;