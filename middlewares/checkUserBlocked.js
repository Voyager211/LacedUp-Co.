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
      return handleUserLogout(req, res, 'User account not found. Please log in again.');
    }

    if (currentUser.isBlocked) {
      // User is blocked, log them out and show error
      return handleUserLogout(req, res, 'Your account has been blocked. Please contact support for assistance.');
    }

    // User is not blocked, continue
    next();
  } catch (error) {
    console.error('Error checking user block status:', error);
    // On error, continue to avoid breaking the application
    next();
  }
};

/**
 * Helper function to safely handle user logout with flash messages
 * Sets flash message before destroying session to prevent crashes
 */
function handleUserLogout(req, res, errorMessage) {
  // Check if this is an AJAX request
  const isAjaxRequest = req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('json') > -1);

  if (isAjaxRequest) {
    // For AJAX requests, return JSON response immediately
    return res.status(403).json({
      error: errorMessage,
      blocked: true,
      redirect: '/login'
    });
  }

  // For regular requests, handle session safely
  try {
    // Set flash message BEFORE destroying session (if session exists)
    if (req.session && typeof req.flash === 'function') {
      req.flash('error', errorMessage);
    }

    // Logout and destroy session
    req.logout((logoutErr) => {
      if (logoutErr) {
        console.error('Logout error:', logoutErr);
      }

      // Destroy session safely
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('Session destroy error:', destroyErr);
          }
          res.clearCookie('connect.sid');

          // If flash message couldn't be set, redirect with URL parameter
          if (!req.session || typeof req.flash !== 'function') {
            return res.redirect('/login?error=' + encodeURIComponent(errorMessage));
          }

          return res.redirect('/login');
        });
      } else {
        // Session already destroyed or doesn't exist
        res.clearCookie('connect.sid');
        return res.redirect('/login?error=' + encodeURIComponent(errorMessage));
      }
    });
  } catch (error) {
    // Fallback for any unexpected errors
    console.error('Error in handleUserLogout:', error);
    res.clearCookie('connect.sid');
    return res.redirect('/login?error=' + encodeURIComponent(errorMessage));
  }
}

module.exports = checkUserBlocked;