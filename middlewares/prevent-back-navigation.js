const preventBackNavigation = (req, res, next) => {
  // Set comprehensive cache control headers
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Check if user is already authenticated (shouldn't access auth pages)
  if (req.isAuthenticated()) {
    return res.redirect('/home');
  }

  next();
};

// Specific middleware for OTP verification pages
const preventOtpBackNavigation = (req, res, next) => {
  // Set comprehensive cache control headers
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Check if user is already authenticated
  if (req.isAuthenticated()) {
    return res.redirect('/home');
  }

  // For signup OTP verification, check if there's pending user data
  if (req.path === '/verify-otp') {
    const email = req.query.email;
    if (!email || !req.session.pendingUser || req.session.pendingUser.email !== email) {
      return res.redirect('/signup');
    }
  }

  // For password reset OTP verification, check if there's a valid reset session
  if (req.path === '/reset-otp') {
    const email = req.query.email;
    if (!email) {
      return res.redirect('/forgot-password');
    }
  }

  // For reset password page, check if there's a valid email parameter
  if (req.path === '/reset-password') {
    const email = req.query.email;
    if (!email) {
      return res.redirect('/forgot-password');
    }
  }

  next();
};

module.exports = {
  preventBackNavigation,
  preventOtpBackNavigation
};