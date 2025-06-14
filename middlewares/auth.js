module.exports = {
    isAuthenticated: (req, res, next) => {
    if (req.isAuthenticated()) return next();
    return res.redirect('/'); // Landing page
    },
    
    isGuest: (req, res, next) => {
    if (!req.isAuthenticated()) return next();
    return res.redirect('/home'); // Redirect logged-in users
    }
};