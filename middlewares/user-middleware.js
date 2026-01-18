exports.addUserContext = (req, res, next) => {
  res.locals.user = req.user || null;
  next();
};

// Middleware to ensure user is authenticated
exports.ensureAuthenticated = (req, res, next) => {
  // Check if user is authenticated via passport (OAuth)
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  // Check if user is authenticated via session
  if (req.session && req.session.userId) {
    return next();
  }
  
  // If not authenticated, redirect to login
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    // For AJAX requests, return JSON error
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      redirectUrl: '/login'
    });
  } else {
    // For regular requests, redirect to login
    return res.redirect('/login');
  }
};

// Middleware to ensure user is not authenticated (for login/register pages)
exports.ensureNotAuthenticated = (req, res, next) => {
  // Check if user is authenticated via passport (OAuth)
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  // Check if user is authenticated via session
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  
  return next();
};