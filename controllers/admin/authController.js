const passport = require('passport');

exports.getLogin = (req, res) => {
    try {
        res.render('admin/login', {
            title: 'Admin Login',
            layout: 'layouts/login-layout',
            message: req.flash('error')
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.postLogin = (req, res, next) => {
    try {
        passport.authenticate('local', {
            failureRedirect: '/admin/login',
            failureFlash: 'Invalid credentials'
        })(req, res, () => {
            try {
                if (req.user.role !== 'admin') {
                    req.logout((err) => {
                        if (err) {
                            console.error('Error logging out non-admin:', err);
                            return res.status(500).send('Logout Error');
                        }
                        req.flash('error', 'Not authorized as admin');
                        res.redirect('/admin/login');
                    });
                } else {
                    req.session.role = 'admin';

                    if (req.body.remember) {
                        // Extended session for "Remember Me" - 30 days
                        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                    } else {
                        // Standard admin session - 60 minutes
                        req.session.cookie.maxAge = 60 * 60 * 1000;
                    }

                    res.redirect('/admin/dashboard');
                }
            } catch (innerErr) {
                console.error('Error during login post-auth callback:', innerErr);
                res.status(500).send('Internal Server Error');
            }
        });
    } catch (error) {
        console.error('Error during postLogin handler:', error);
        next(error); // Let Express handle it or add custom fallback
    }
};


// exports.getDashboard = (req, res) => {
//     try {
//         res.render('admin/dashboard', { title: 'Dashboard' });
//     } catch (error) {
//         console.error('Error rendering dashboard:', error);
//         res.status(500).send('Internal Server Error');
//     }
// };

exports.logout = (req, res) => {
    try {
        req.logout((err) => {
            if (err) {
                console.error('Logout error:', err);
                return res.status(500).send('Logout Error');
            }

            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    console.error('Session destroy error:', destroyErr);
                    return res.status(500).send('Session Error');
                }

                res.redirect('/admin/login');
            });
        });
    } catch (error) {
        console.error('Unexpected error in logout:', error);
        res.status(500).send('Internal Server Error');
    }
};
