module.exports = {
    isAuthenticated: (req, res, next) => {
        if (req.isAuthenticated()) return next();
        return res.redirect('/'); // Landing page
    },
    
    isGuest: (req, res, next) => {
        if (!req.isAuthenticated()) return next();
        return res.redirect('/home'); // Redirect logged-in users
    },

    requireAuth: (req, res, next) => {
        if (req.isAuthenticated()) {
            return next();
        }
        // For API routes, return JSON error
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        // For page routes, redirect to login
        return res.redirect('/admin/login');
    }
};
