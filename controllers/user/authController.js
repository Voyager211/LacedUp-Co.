const User = require('../../models/User');
const crypto = require('crypto');
const sendOtp = require('../../utils/sendOtp');
const passport = require('passport');
const { generateReferralCode } = require('../../utils/referralCodeGenerator');
const Wallet = require('../../models/Wallet');
const walletService = require('../../services/paymentProviders/walletService'); 

const getSignup = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/home');
  res.render('user/auth/signup', {
    title: 'Sign Up',
    layout: 'user/layouts/auth-layout'
  });
};

const postSignup = async (req, res) => {
  const { name, email, phone, password, confirmPassword, referralCode } = req.body;

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

    // Handle referral code validation BEFORE storing in session
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ 
        referralCode: referralCode.toUpperCase() 
      });
      
      if (!referrer) {
        return res.status(400).json({ 
          error: 'Invalid referral code. Please check and try again.' 
        });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 60 * 1000; // 1 minute

    // Store user data temporarily in session with referral info
    req.session.pendingUser = {
      name,
      email,
      phone,
      password,
      otpHash,
      otpExpiresAt,
      referralCode: referralCode ? referralCode.toUpperCase() : null,
      referrerId: referrer ? referrer._id : null
    };

    // Create a temporary user object for sending email (without saving to DB)
    const tempUser = { name, email };
    await sendOtp(tempUser, otp);

    return res.status(200).json({ 
      success: true, 
      redirect: `/verify-otp?email=${encodeURIComponent(email)}` 
    });

  } catch (err) {
    console.error('Signup Error:', err);

    // Provide specific error messages for email issues
    if (err.message && err.message.includes('Email authentication failed')) {
      return res.status(500).json({
        error: 'Email service configuration error. Please contact support.'
      });
    } else if (err.message && err.message.includes('Email service not configured')) {
      return res.status(500).json({
        error: 'Email service is temporarily unavailable. Please try again later.'
      });
    } else {
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
  }
};


const getLogin = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/home');

  // Handle error messages from URL parameters (fallback when flash is unavailable)
  let errorMessage = null;
  if (req.query.error) {
    errorMessage = decodeURIComponent(req.query.error);
  }

  res.render('user/auth/login', {
    title: 'Login',
    layout: 'user/layouts/auth-layout',
    errorMessage: errorMessage
  });
};

const postLogin = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ error: 'Something went wrong.' });
    if (!user) return res.status(401).json({ error: info.message || 'Invalid credentials.' });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed.' });
      return res.status(200).json({ success: true });
    });
  })(req, res, next);
};

const logout = (req, res) => {
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
const getOtpPage = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/home');
  const { email } = req.query;

  if (!email) return res.redirect('/signup');

  res.render('user/auth/verify-otp', {
    title: 'Verify OTP',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Verify OTP
const postOtpVerification = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Check if this is a signup OTP verification (user data in session)
    if (req.session.pendingUser && req.session.pendingUser.email === email) {
      const pendingUser = req.session.pendingUser;
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      const isExpired = pendingUser.otpExpiresAt < Date.now();
      const isValid = pendingUser.otpHash === otpHash;

      if (isExpired) {
        delete req.session.pendingUser;
        return res.status(410).json({ error: 'OTP expired. Please sign up again.' });
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect OTP. Try again.' });
      }

      // Create the new user
      const newUser = new User({
        name: pendingUser.name,
        email: pendingUser.email,
        phone: pendingUser.phone,
        password: pendingUser.password
      });

      // Generate unique referral code for new user
      newUser.referralCode = await generateReferralCode(newUser._id);

      // Set referral relationship if referrer exists
      if (pendingUser.referrerId) {
        newUser.referredBy = pendingUser.referrerId;
        newUser.hasUsedReferralCode = true;
      }

      await newUser.save();

      // ✅ CREATE WALLET FOR NEW USER
      let newUserWalletAmount = 0;
      
      // If user signed up with referral code, give ₹100 bonus
      if (pendingUser.referrerId) {
        newUserWalletAmount = 100;
      }

      try {
        // Create wallet with initial balance
        const newUserWallet = new Wallet({
          userId: newUser._id,
          balance: newUserWalletAmount,
          transactions: []
        });

        // If referred, add welcome bonus transaction
        if (pendingUser.referrerId) {
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 10000);
          const transactionId = `TXN${timestamp}${random}`;

          newUserWallet.transactions.push({
            transactionId: transactionId,
            type: 'credit',
            amount: 100,
            description: 'Referral welcome bonus',
            paymentMethod: 'referral_reward',
            status: 'completed',
            balanceAfter: 100,
            date: new Date()
          });
        }

        await newUserWallet.save();
        console.log(`✅ Wallet created for new user: ${newUser.email} (Balance: ₹${newUserWalletAmount})`);
      } catch (walletError) {
        console.error('❌ Error creating wallet for new user:', walletError);
      }

      // ✅ Process referral reward for REFERRER (₹300)
      if (pendingUser.referrerId) {
        try {
          // Use walletService to add ₹300 to referrer's wallet
          await walletService.addTransaction(pendingUser.referrerId, {
            type: 'credit',
            amount: 300,
            description: `Referral reward for inviting ${newUser.name}`,
            paymentMethod: 'referral_reward',
            status: 'completed'
          });

          // Update referrer's referral count
          await User.findByIdAndUpdate(pendingUser.referrerId, {
            $inc: { referralCount: 1 }
          });

          console.log(`✅ Referral rewards processed:
            - ₹300 credited to referrer wallet (${pendingUser.referrerId})
            - ₹100 credited to new user wallet (${newUser.email})`);

        } catch (referralError) {
          console.error('❌ Error processing referral reward:', referralError);
          // Don't fail the registration if referral processing fails
        }
      }

      // Clear pending user data from session
      delete req.session.pendingUser;

      // Log the user in
      req.login(newUser, (err) => {
        if (err) return res.status(500).json({ error: 'Account created but login failed.' });
        return res.status(200).json({ success: true });
      });

    } else {
      // This is for existing users (password reset flow)
      const user = await User.findOne({ email });
      if (!user || !user.otpHash) {
        return res.status(400).json({ error: 'Invalid request or OTP expired.' });
      }

      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const isExpired = user.otpExpiresAt < Date.now();
      const isValid = user.otpHash === otpHash;

      if (isExpired) {
        return res.status(410).json({ error: 'OTP expired. Please try again.' });
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect OTP. Try again.' });
      }

      user.otpHash = undefined;
      user.otpExpiresAt = undefined;
      await user.save();

      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: 'OTP verified but login failed.' });
        return res.status(200).json({ success: true });
      });
    }

  } catch (err) {
    console.error('OTP Verify Error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};





const resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if this is a signup OTP resend (user data in session)
    if (req.session.pendingUser && req.session.pendingUser.email === email) {
      const pendingUser = req.session.pendingUser;

      // Generate new OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const otpExpiresAt = Date.now() + 60 * 1000; // 1 minute

      // Update pending user data with new OTP
      req.session.pendingUser.otpHash = otpHash;
      req.session.pendingUser.otpExpiresAt = otpExpiresAt;

      // Send OTP email
      const tempUser = { name: pendingUser.name, email: pendingUser.email };
      await sendOtp(tempUser, otp);

      return res.status(200).json({ success: true });

    } else {
      // This is for existing users (password reset flow)
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: 'User not found.' });

      // Generate new OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const otpExpiresAt = Date.now() + 60 * 1000; // 1 minute

      user.otpHash = otpHash;
      user.otpExpiresAt = otpExpiresAt;
      await user.save();

      await sendOtp(user, otp);
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error('Resend OTP Error:', err);

    // Provide specific error messages for email issues
    if (err.message && err.message.includes('Email authentication failed')) {
      return res.status(500).json({
        error: 'Email service configuration error. Please contact support.'
      });
    } else if (err.message && err.message.includes('Email service not configured')) {
      return res.status(500).json({
        error: 'Email service is temporarily unavailable. Please try again later.'
      });
    } else {
      return res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
    }
  }
};


// GET: Forgot password page
const getForgotPassword = (req, res) => {
  res.render('user/auth/forgot-password', {
    title: 'Forgot Password',
    layout: 'user/layouts/auth-layout'
  });
};

// POST: Send OTP for password reset
const sendResetOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'No account with that email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log (otp);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 60 * 1000; // 1 minute

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

    // Provide specific error messages for email issues
    if (err.message && err.message.includes('Email authentication failed')) {
      return res.status(500).json({
        error: 'Email service configuration error. Please contact support.'
      });
    } else if (err.message && err.message.includes('Email service not configured')) {
      return res.status(500).json({
        error: 'Email service is temporarily unavailable. Please try again later.'
      });
    } else {
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
  }
};

// GET: OTP input page for reset
const getResetOtpPage = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/home');
  const { email } = req.query;
  if (!email) return res.redirect('/forgot-password');

  res.render('user/auth/reset-otp', {
    title: 'Enter OTP',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Verify reset OTP
const verifyResetOtp = async (req, res) => {
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
const getResetPasswordPage = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/home');
  const { email } = req.query;
  if (!email) return res.redirect('/forgot-password');

  res.render('user/auth/reset-password', {
    title: 'Reset Password',
    layout: 'user/layouts/auth-layout',
    email
  });
};

// POST: Resend OTP for password reset
const resendResetOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Reset OTP resend:', otp);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = Date.now() + 60 * 1000; // 1 minute

    user.otpHash = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await sendOtp(user, otp);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Resend Reset OTP Error:', err);

    // Provide specific error messages for email issues
    if (err.message && err.message.includes('Email authentication failed')) {
      return res.status(500).json({
        error: 'Email service configuration error. Please contact support.'
      });
    } else if (err.message && err.message.includes('Email service not configured')) {
      return res.status(500).json({
        error: 'Email service is temporarily unavailable. Please try again later.'
      });
    } else {
      return res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
    }
  }
};

// POST: Final password update
const resetPassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  try {
    if (!newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Check if new password is the same as current password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ 
        error: 'New password cannot be the same as your current password. Please choose a different password.' 
      });
    }

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

module.exports = {
  getSignup,
  postSignup,
  getLogin,
  postLogin,
  logout,
  getOtpPage,
  postOtpVerification,
  resendOtp,
  getForgotPassword,
  sendResetOtp,
  getResetOtpPage,
  verifyResetOtp,
  getResetPasswordPage,
  resendResetOtp,
  resetPassword
};