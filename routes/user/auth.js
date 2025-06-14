const express = require('express');
const passport = require('passport');
const authController = require('../../controllers/user/authController');
const { isGuest } = require('../../middlewares/auth'); // ✅ Fixed double slashes

const router = express.Router();

// === Signup ===
router.get('/signup', isGuest, authController.getSignup);
router.post('/signup', isGuest, authController.postSignup);

// === OTP Verification ===
router.get('/verify-otp', isGuest, authController.getOtpPage);
router.post('/verify-otp', isGuest, authController.postOtpVerification);
router.post('/resend-otp', isGuest, authController.resendOtp);



// === Login ===
router.get('/login', isGuest, authController.getLogin);
router.post('/login', isGuest, authController.postLogin);

// === Forgot Password Flow ===
router.get('/forgot-password', isGuest, authController.getForgotPassword);
router.post('/forgot-password', isGuest, authController.sendResetOtp);

router.get('/reset-otp', isGuest, authController.getResetOtpPage);
router.post('/reset-otp', isGuest, authController.verifyResetOtp);

router.get('/reset-password', isGuest, authController.getResetPasswordPage);
router.post('/reset-password', isGuest, authController.resetPassword);



// === Google Login ===
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureFlash: true
  }),
  (req, res) => {
    res.redirect('/'); // Redirect to homepage or profile after success
  }
);

router.get('/logout', authController.logout);

module.exports = router;
