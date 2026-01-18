module.exports = (req, res, next) => {
    try {
        if (req.isAuthenticated() && req.session.role === 'admin') {
            return next();
        }
        req.flash('error', 'Admin access only');
        res.redirect('/admin/login');
    } catch (error) {
        console.error('Error in isAdmin middleware:', error);
        res.status(500).send('Internal Server Error');
    }
};
