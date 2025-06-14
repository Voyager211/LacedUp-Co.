const User = require('../../models/User');
const crypto = require('crypto');
const sendOtp = require('../../utils/sendOtp');
const passport = require('passport');

exports.getSignup = (req, res) => {
  res.render('user/auth/signup', {
    title: 'Sign Up',
    layout: 'user/layouts/auth-layout'
  });
};

exports.postSignup = async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body;

  try {
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use.' });
    }

    const user = new User({ name, email, phone, password });
    
     // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes
    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    
    await user.save();
    await sendOtp(user, otp);

   return res.status(200).json({ success: true, redirect: `/verify-otp?email=${encodeURIComponent(email)}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.getLogin = (req, res) => {
  res.render('user/auth/login', {
    title: 'Login',
    layout: 'user/layouts/auth-layout'
  });
};

exports.postLogin = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ error: 'Something went wrong.' });
    if (!user) return res.status(401).json({ error: info.message || 'Invalid credentials.' });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed.' });
      return res.status(200).json({ success: true });
    });
  })(req, res, next);
};

exports.logout = (req, res) => {
  req.logout(() => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.redirect('/home'); // fallback
      }
      res.clearCookie('connect.sid'); // clear cookie manually
      return res.redirect('/');
    });
  });
};

// GET: OTP verification page
exports.getOtpPage = (req, res) => {
  const { email } = req.query;

  if (!email) return res.redirect('/signup');

  res.render('user/auth/verify-otp', {
    title: 'Verify OTP',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Verify OTP
exports.postOtpVerification = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.otpHash) {
      return res.status(400).json({ error: 'Invalid request or OTP expired.' });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const isExpired = user.otpExpiresAt < Date.now();
    const isValid = user.otpHash === otpHash;

    if (isExpired) {
      return res.status(410).json({ error: 'OTP expired. Please sign up again.' });
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect OTP. Try again.' });
    }

    // Clear OTP fields and save
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'OTP verified but login failed.' });
      return res.status(200).json({ success: true });
    });

  } catch (err) {
    console.error('OTP Verify Error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 2 * 60 * 1000;

    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await sendOtp(user, otp);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Resend OTP Error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP.' });
  }
};


// GET: Forgot password page
exports.getForgotPassword = (req, res) => {
  res.render('user/auth/forgot-password', {
    title: 'Forgot Password',
    layout: 'user/layouts/auth-layout'
  });
};

// POST: Send OTP for password reset
exports.sendResetOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'No account with that email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log (otp);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 2 * 60 * 1000;

    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await sendOtp(user, otp); // ✅ Must pass user object

    return res.status(200).json({
      success: true,
      redirect: `/reset-otp?email=${encodeURIComponent(email)}`
    });
  } catch (err) {
    console.error('Reset OTP Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// GET: OTP input page for reset
exports.getResetOtpPage = (req, res) => {
  const { email } = req.query;
  if (!email) return res.redirect('/forgot-password');

  res.render('user/auth/reset-otp', {
    title: 'Enter OTP',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Verify reset OTP
exports.verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.otpHash) {
      return res.status(400).json({ error: 'Invalid request or OTP expired.' });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const isExpired = user.otpExpiresAt < Date.now();
    const isValid = user.otpHash === otpHash;

    if (isExpired) {
      return res.status(410).json({ error: 'OTP expired. Try again.' });
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect OTP. Try again.' });
    }

    return res.status(200).json({ success: true, redirect: `/reset-password?email=${encodeURIComponent(email)}` });

  } catch (err) {
    console.error('Verify Reset OTP Error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
};

// GET: Reset password form
exports.getResetPasswordPage = (req, res) => {
  const { email } = req.query;
  if (!email) return res.redirect('/forgot-password');

  res.render('user/auth/reset-password', {
    title: 'Reset Password',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Final password update
exports.resetPassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  try {
    if (!newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.password = newPassword;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
};
