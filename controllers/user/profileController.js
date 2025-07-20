// User profile controller - handles profile management, email changes, password updates, and photo uploads
const User = require("../../models/User");
const sendOtp = require("../../utils/sendOtp");
const bcrypt = require("bcryptjs");
const Order = require('../../models/Order');
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Generate OTP function (since generateOtp utility might not exist)
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Email validation function
const validateEmailFormat = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmedEmail = email ? email.trim().toLowerCase() : '';
  
  if (!trimmedEmail) {
    return { isValid: false, error: 'Email is required' };
  }
  
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  
  return { isValid: true, trimmedValue: trimmedEmail };
};

// Enhanced name validation function
const validateProfileName = (name) => {
  const trimmedName = name ? name.trim() : '';
  
  if (!trimmedName) {
    return { isValid: false, error: 'Full name is required' };
  }
  
  if (trimmedName.length < 2) {
    return { isValid: false, error: 'Full name must be at least 2 characters long' };
  }
  
  if (trimmedName.length > 50) {
    return { isValid: false, error: 'Full name cannot exceed 50 characters' };
  }
  
  // Check for numbers
  if (/\d/.test(trimmedName)) {
    return { isValid: false, error: 'Full name should not contain numbers' };
  }
  
  // Check for special characters (allow only letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(trimmedName)) {
    return { isValid: false, error: 'Full name can only contain letters, spaces, hyphens, and apostrophes' };
  }
  
  // Check for excessive spaces
  if (/\s{2,}/.test(trimmedName)) {
    return { isValid: false, error: 'Full name cannot contain multiple consecutive spaces' };
  }
  
  // Check if it starts or ends with space
  if (trimmedName !== name.trim()) {
    return { isValid: false, error: 'Full name cannot start or end with spaces' };
  }
  
  return { isValid: true, trimmedValue: trimmedName };
};

// Phone validation function
const validateProfilePhone = (phone) => {
  const trimmedPhone = phone ? phone.trim() : '';
  
  if (!trimmedPhone) {
    return { isValid: true, trimmedValue: null }; // Phone is optional
  }
  
  // Remove any non-digit characters for validation
  const digitsOnly = trimmedPhone.replace(/\D/g, '');
  
  if (digitsOnly.length !== 10) {
    return { 
      isValid: false, 
      field: 'phone',
      error: 'Phone number must be exactly 10 digits' 
    };
  }
  
  if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
    return { 
      isValid: false, 
      field: 'phone',
      error: 'Phone number must start with 6, 7, 8, or 9' 
    };
  }
  
  return { isValid: true, trimmedValue: digitsOnly };
};

exports.loadProfile = async (req, res) => {
  try {
    // Get userId from session or req.user (Passport.js)
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('-password').lean();

    if (!user) {
      return res.redirect('/login');
    }

    // Render the new minimalist profile page
    res.render('user/profile', {
      title: 'My Profile - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'profile',
      user: user
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.status(500).send('Server Error');
  }
};

exports.loadEditProfile = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('-password').lean();

    if (!user) {
      return res.redirect('/login');
    }

    res.render('user/edit-profile', {
      title: 'Edit Profile - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'profile',
      user: user
    });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.status(500).send('Server Error');
  }
};

exports.loadChangePassword = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    res.render('user/change-password', {
      user,
      title: 'Change Password - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'profile'
    });
  } catch (error) {
    console.error('Error loading change password page:', error);
    res.status(500).render('error', { message: 'Error loading change password page' });
  }
};

// Note: loadAddresses moved to addressController.js
// This function is kept for backward compatibility but should use the address controller
exports.loadAddresses = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    res.render('user/address-book', {
      user,
      title: 'Address Book - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'addresses'
    });
  } catch (error) {
    console.error('Error loading addresses page:', error);
    res.status(500).render('error', { message: 'Error loading addresses page' });
  }
};

exports.loadWallet = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Mock wallet data for now
    const wallet = {
      balance: 0,
      transactions: []
    };

    const totalAdded = wallet.transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSpent = wallet.transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    const recentTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    res.render('user/wallet', {
      user,
      title: 'My Wallet - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'profile',
      wallet: {
        balance: wallet.balance,
        totalAdded,
        totalSpent,
        transactions: recentTransactions
      }
    });
  } catch (error) {
    console.error('Error loading wallet page:', error);
    res.status(500).render('error', { message: 'Error loading wallet page' });
  }
};

// Simple email update function (for inline editing with OTP)
exports.updateEmail = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to update email'
      });
    }

    const { email } = req.body;

    // Validate email using the existing validator
    const emailValidation = validateEmailFormat(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({
      email: emailValidation.trimmedValue,
      _id: { $ne: userId }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This email address is already registered'
      });
    }

    // Get current user
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if the new email is the same as current email
    if (currentUser.email === emailValidation.trimmedValue) {
      return res.status(400).json({
        success: false,
        message: 'This is already your current email address'
      });
    }

    // Generate OTP for email change
    const otp = generateOtp();
    console.log(`Email change OTP: ${otp}`);

    // Store OTP and new email in session
    req.session.emailChangeOtp = {
      otp,
      currentEmail: currentUser.email,
      newEmail: emailValidation.trimmedValue,
      userId: userId,
      expiresAt: Date.now() + 60 * 1000 // 1 minute
    };

    // Send OTP to current email
    try {
      await sendOtp({ email: currentUser.email, name: currentUser.name }, otp);
      
      res.json({
        success: true,
        requiresOtp: true,
        message: 'OTP sent to your current email address',
        currentEmail: currentUser.email,
        newEmail: emailValidation.trimmedValue
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

  } catch (error) {
    console.error('Error initiating email update:', error);

    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to initiate email update'
    });
  }
};

// Verify OTP and complete email update
exports.verifyEmailUpdateOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP session found. Please start the email change process again.'
      });
    }

    // Check if OTP expired - but don't clear session, allow resend
    if (Date.now() > sessionOtp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please use the resend option to get a new code.'
      });
    }

    // Verify OTP
    if (String(otp) !== String(sessionOtp.otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Update user email
    const updatedUser = await User.findByIdAndUpdate(
      sessionOtp.userId,
      { email: sessionOtp.newEmail },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update session email if it exists
    if (req.session.email) {
      req.session.email = sessionOtp.newEmail;
    }

    // Clear email change session only on successful verification
    req.session.emailChangeOtp = null;

    res.json({
      success: true,
      message: 'Email address updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error verifying email update OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Resend OTP for email update
exports.resendEmailUpdateOtp = async (req, res) => {
  try {
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP session found. Please start the email change process again.'
      });
    }

    // Don't check for expiry here - that's the point of resending
    // Generate new OTP
    const newOtp = generateOtp();
    console.log(`Resent email change OTP: ${newOtp}`);

    // Update session with new OTP and reset expiry (don't check if expired)
    req.session.emailChangeOtp = {
      ...sessionOtp,
      otp: newOtp,
      expiresAt: Date.now() + 60 * 1000 // 1 minute
    };

    // Get user for sending email
    const user = await User.findById(sessionOtp.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Send new OTP to current email
    try {
      await sendOtp({ email: sessionOtp.currentEmail, name: user.name }, newOtp);
      
      res.json({
        success: true,
        message: 'New OTP sent to your current email address'
      });
    } catch (emailError) {
      console.error('Error resending OTP email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to resend OTP. Please try again.'
      });
    }

  } catch (error) {
    console.error('Error resending email update OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP'
    });
  }
};

// Update profile data (excluding email) with enhanced validation
exports.updateProfileData = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to update profile'
      });
    }

    const { fullname, phone } = req.body;
    const errors = {};

    // Validate fullname using enhanced validator
    const nameValidation = validateProfileName(fullname);
    if (!nameValidation.isValid) {
      errors.fullname = nameValidation.error;
    }

    // Validate phone using the validator
    const phoneValidation = validateProfilePhone(phone);
    if (!phoneValidation.isValid) {
      errors[phoneValidation.field] = phoneValidation.error;
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Check if user exists
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user profile
    const updateData = {
      name: nameValidation.trimmedValue
    };

    // Only update phone if provided
    if (phoneValidation.trimmedValue) {
      updateData.phone = phoneValidation.trimmedValue;
    } else if (phone === '') {
      // If empty string is sent, remove phone number
      updateData.phone = null;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating profile:', error);

    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Verify current email for email change
exports.verifyCurrentEmail = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const { currentEmail } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to verify email'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current email
    if (user.email !== currentEmail.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Current email is incorrect'
      });
    }

    // Generate OTP for email change
    const otp = generateOtp();
    console.log(`Email change OTP: ${otp}`);

    // Store OTP in session for email change
    req.session.emailChangeOtp = {
      otp,
      email: user.email,
      userId: userId,
      expiresAt: Date.now() + 45 * 1000 // 45 seconds
    };

    // Send OTP to current email
    try {
      await sendOtp({ email: user.email, name: user.name }, otp);
      
      res.json({
        success: true,
        message: 'OTP sent to your current email address'
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }

  } catch (error) {
    console.error('Error verifying current email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email'
    });
  }
};

// Load email change OTP page
exports.loadEmailChangeOtp = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.redirect('/login');
    }

    // Check if email change session exists
    if (!req.session.emailChangeOtp) {
      return res.redirect('/profile/edit');
    }

    // Get user data
    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.redirect('/login');
    }

    res.render('user/email-change-otp', {
      title: 'Verify Email Change - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'profile',
      user: user,
      email: req.session.emailChangeOtp.email
    });
  } catch (error) {
    console.error('Error loading email change OTP page:', error);
    res.status(500).send('Server Error');
  }
};

// Verify OTP for email change
exports.verifyEmailChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP session found. Please start the email change process again.'
      });
    }

    // Check if OTP expired
    if (Date.now() > sessionOtp.expiresAt) {
      req.session.emailChangeOtp = null;
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please start the email change process again.'
      });
    }

    // Verify OTP
    if (String(otp) !== String(sessionOtp.otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Mark OTP as verified
    req.session.emailChangeOtp.verified = true;

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Error verifying email change OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Change email address
exports.changeEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const sessionOtp = req.session.emailChangeOtp;

    if (!sessionOtp || !sessionOtp.verified) {
      return res.status(400).json({
        success: false,
        message: 'Email change not authorized. Please verify OTP first.'
      });
    }

    // Validate new email using the validator
    const emailValidation = validateEmailFormat(newEmail);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error
      });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({
      email: emailValidation.trimmedValue,
      _id: { $ne: sessionOtp.userId }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This email address is already registered'
      });
    }

    // Update user email
    const updatedUser = await User.findByIdAndUpdate(
      sessionOtp.userId,
      { email: emailValidation.trimmedValue },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update session email
    req.session.email = emailValidation.trimmedValue;

    // Clear email change session
    req.session.emailChangeOtp = null;

    res.json({
      success: true,
      message: 'Email address updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error changing email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email address'
    });
  }
};

// Update password function
exports.updatePassword = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to change password'
      });
    }

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    // Password requirements validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    if (newPassword.includes(' ')) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot contain spaces'
      });
    }

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
    });
  }
};

// Upload profile photo
exports.uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to upload profile photo'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../../public/uploads/profiles');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `profile_${userId}_${timestamp}.jpg`;
    const filepath = path.join(uploadsDir, filename);

    // Process and save the image using Sharp
    await sharp(req.file.buffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(filepath);

    // Get current user to check for existing profile photo
    const currentUser = await User.findById(userId);

    // Delete old profile photo if it exists
    if (currentUser.profilePhoto) {
      const oldPhotoPath = path.join(uploadsDir, currentUser.profilePhoto);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    // Update user with new profile photo
    await User.findByIdAndUpdate(userId, {
      profilePhoto: filename
    });

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      filename: filename
    });

  } catch (error) {
    console.error('Error uploading profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile photo'
    });
  }
};

// Delete profile photo
exports.deleteProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to delete profile photo'
      });
    }

    // Get current user to check for existing profile photo
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!currentUser.profilePhoto) {
      return res.status(400).json({
        success: false,
        message: 'No profile photo to delete'
      });
    }

    // Delete the physical file
    const photoPath = path.join(__dirname, '../../public/uploads/profiles', currentUser.profilePhoto);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    // Update user to remove profile photo
    await User.findByIdAndUpdate(userId, {
      $unset: { profilePhoto: 1 }
    });

    res.json({
      success: true,
      message: 'Profile photo deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile photo'
    });
  }
};

// Logout function
exports.logout = async (req, res) => {
  try {
    // Check if there's an active session
    const userId = req.session.userId || req.session.googleUserId || (req.user && req.user._id);
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Destroy session and clear cookies
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error", err);
        return res.status(500).json({
          success: false,
          message: "Failed to logout, Please try again",
        });
      }

      // Clear all session-related cookies
      res.clearCookie("connect.sid");
      
      // Also clear any other potential session cookies
      if (req.cookies) {
        Object.keys(req.cookies).forEach(cookieName => {
          res.clearCookie(cookieName);
        });
      }

      return res.redirect("/login");
    });

  } catch (error) {
    console.error("Logout error", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};