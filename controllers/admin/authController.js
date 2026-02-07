const passport = require('passport');

const getLogin = (req, res) => {
    try {
        if (req.isAuthenticated()) return res.redirect('/admin/dashboard');
        res.render('admin/login', {
            title: 'Admin Login',
            layout: 'layouts/login-layout',
            message: req.flash('error'),
            formData: req.flash('formData')[0] || {}
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.status(500).send('Internal Server Error');
    }
};

const postLogin = (req, res, next) => {
    try {
        // Server-side validation before authentication
        const validationResult = validateLoginForm(req.body);

        if (!validationResult.isValid) {
            // Store form data to preserve user input
            req.flash('formData', {
                email: req.body.email ? req.body.email.trim() : '',
                remember: req.body.remember || false
            });
            req.flash('error', validationResult.message);
            return res.redirect('/admin/login');
        }

        // Trim and sanitize input before authentication
        req.body.email = req.body.email.trim();
        req.body.password = req.body.password.trim();

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




const logout = (req, res) => {
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

/**
 * Server-side validation for admin login form
 * @param {Object} formData - The form data from request body
 * @returns {Object} - Validation result with isValid boolean and message
 */
function validateLoginForm(formData) {
    const { email, password } = formData;

    // Check if email is provided
    if (!email || !email.trim()) {
        return { isValid: false, message: 'Email is required' };
    }

    // Check if password is provided
    if (!password || !password.trim()) {
        return { isValid: false, message: 'Password is required' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = email.trim();

    if (!emailRegex.test(trimmedEmail)) {
        return { isValid: false, message: 'Please enter a valid email address' };
    }

    // Validate password length
    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 6) {
        return { isValid: false, message: 'Password must be at least 6 characters' };
    }

    return { isValid: true };
}

module.exports = {
    getLogin,
    postLogin,
    logout
}