const express = require('express');
const passport = require('passport');
const authController = require('../../controllers/user/authController');
const nocache = require('../../middlewares/nocache')
const { preventBackNavigation, preventOtpBackNavigation } = require('../../middlewares/prevent-back-navigation');
const { isGuest } = require('../../middlewares/auth'); // ✅ Fixed double slashes

const router = express.Router();

// === Signup ===
router.get('/signup', isGuest, preventBackNavigation, authController.getSignup);
router.post('/signup', isGuest, authController.postSignup);

// === OTP Verification ===
router.get('/verify-otp', isGuest, preventOtpBackNavigation, authController.getOtpPage);
router.post('/verify-otp', isGuest, authController.postOtpVerification);
router.post('/resend-otp', isGuest, authController.resendOtp);



// === Login ===
router.get('/login', isGuest, preventBackNavigation, authController.getLogin);
router.post('/login', isGuest, authController.postLogin);

// === Forgot Password Flow ===
router.get('/forgot-password', isGuest, preventBackNavigation, authController.getForgotPassword);
router.post('/forgot-password', isGuest, authController.sendResetOtp);

router.get('/reset-otp', isGuest, preventOtpBackNavigation, authController.getResetOtpPage);
router.post('/reset-otp', isGuest, authController.verifyResetOtp);
router.post('/resend-reset-otp', isGuest, authController.resendResetOtp);

router.get('/reset-password', isGuest, preventOtpBackNavigation, authController.getResetPasswordPage);
router.post('/reset-password', isGuest, authController.resetPassword);



// === Google Login ===
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error('Google OAuth error:', err);
      return res.redirect('/login?error=oauth_error');
    }

    if (!user) {
      // Check if it's a blocked user error
      if (info && info.message && info.message.includes('blocked')) {
        return res.redirect('/login?error=blocked&message=' + encodeURIComponent(info.message));
      }
      return res.redirect('/login?error=oauth_failed');
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error after OAuth:', loginErr);
        return res.redirect('/login?error=login_failed');
      }
      return res.redirect('/home');
    });
  })(req, res, next);
});

router.get('/logout', authController.logout);

// Test route for email configuration (remove in production)
router.get('/test-email', async (req, res) => {
  try {
    const { testEmailConfig } = require('../../utils/sendEmail');
    const isConfigValid = await testEmailConfig();

    res.json({
      success: isConfigValid,
      message: isConfigValid ? 'Email configuration is working' : 'Email configuration failed',
      env: {
        EMAIL_USER: process.env.EMAIL_USER,
        EMAIL_PASS_LENGTH: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;