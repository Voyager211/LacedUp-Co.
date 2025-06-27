const User = require('../models/User');

/**
 * Middleware to check if the currently logged-in user is blocked
 * If blocked, automatically log them out and redirect with error message
 */
const checkUserBlocked = async (req, res, next) => {
  // Skip check for non-authenticated users
  if (!req.isAuthenticated() || !req.user) {
    return next();
  }

  // Skip check for admin users
  if (req.user.role === 'admin') {
    return next();
  }

  // Skip check for auth-related routes to prevent infinite redirects
  const authRoutes = ['/login', '/logout', '/signup', '/verify-otp', '/forgot-password', '/reset-password'];
  if (authRoutes.some(route => req.path.includes(route))) {
    return next();
  }

  try {
    // Fetch fresh user data from database to check current block status
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser) {
      // User doesn't exist anymore, log them out
      req.logout(() => {
        req.session.destroy((err) => {
          if (err) console.error('Session destroy error:', err);
          res.clearCookie('connect.sid');
          return res.redirect('/login');
        });
      });
      return;
    }

    if (currentUser.isBlocked) {
      // User is blocked, log them out and show error
      req.logout(() => {
        req.session.destroy((err) => {
          if (err) console.error('Session destroy error:', err);
          res.clearCookie('connect.sid');
          
          // For AJAX requests, return JSON response
          if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(403).json({
              error: 'Your account has been blocked. Please contact support.',
              blocked: true,
              redirect: '/login'
            });
          }
          
          // For regular requests, redirect to login with error message
          req.flash('error', 'Your account has been blocked. Please contact support.');
          return res.redirect('/login');
        });
      });
      return;
    }

    // User is not blocked, continue
    next();
  } catch (error) {
    console.error('Error checking user block status:', error);
    // On error, continue to avoid breaking the application
    next();
  }
};

module.exports = checkUserBlocked;
