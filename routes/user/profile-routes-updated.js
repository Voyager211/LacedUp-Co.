const express = require('express');
const router = express.Router();
const multer = require('multer');
const profileController = require('../../controllers/user/profileController');

// Configure multer for profile photo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

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

// Profile routes
router.get('/profile', requireAuth, profileController.loadProfile);
router.get('/profile/edit', requireAuth, profileController.loadEditProfile);
router.post('/profile/edit', requireAuth, profileController.updateProfileData);

// Simple email update route (for inline editing with OTP)
router.post('/profile/email', requireAuth, profileController.updateEmail);
router.post('/profile/verify-email-update-otp', requireAuth, profileController.verifyEmailUpdateOtp);
router.post('/profile/resend-email-update-otp', requireAuth, profileController.resendEmailUpdateOtp);

// Email change routes
router.post('/profile/verify-current-email', requireAuth, profileController.verifyCurrentEmail);
router.get('/profile/email-change-otp', requireAuth, profileController.loadEmailChangeOtp);
router.post('/profile/verify-email-otp', requireAuth, profileController.verifyEmailChangeOtp);
router.post('/profile/change-email', requireAuth, profileController.changeEmail);

// Password change routes
router.get('/profile/change-password', requireAuth, profileController.loadChangePassword);
router.post('/profile/change-password', requireAuth, profileController.updatePassword);

// Address routes
router.get('/profile/addresses', requireAuth, profileController.loadAddresses);

// Wallet routes
router.get('/profile/wallet', requireAuth, profileController.loadWallet);

// Orders routes
router.get('/orders', requireAuth, profileController.loadOrders);

// Profile photo routes
router.post('/profile/photo', requireAuth, upload.single('profilePhoto'), profileController.uploadProfilePhoto);
router.delete('/profile/photo', requireAuth, profileController.deleteProfilePhoto);

// Logout route
router.post('/logout', profileController.logout);
router.get('/logout', profileController.logout);

// API routes for addresses
router.get('/api/addresses', requireAuth, require('../../controllers/user/addressController').getAddresses);

module.exports = router;