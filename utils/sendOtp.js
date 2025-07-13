const sendEmail = require('./sendEmail');
const mockSendEmail = require('./mockEmail');
const ejs = require('ejs');
const path = require('path');

// Use mock email if EMAIL_USER is not configured or if MOCK_EMAIL is set to true
const USE_MOCK_EMAIL = !process.env.EMAIL_USER || process.env.MOCK_EMAIL === 'true';

/**
 * Sends OTP email using EJS template
 * @param {Object} user - User object containing email and name
 * @param {string} otp - The OTP code to send
 * @throws {Error} If template rendering or email sending fails
 */
module.exports = async function sendOtp(user, otp) {
  try {
    // Resolve the path to the EJS template
    const templatePath = path.join(__dirname, '..', 'views', 'user', 'partials', 'otp-email.ejs');
    
    // Render the EJS template with user and OTP data
    const html = await ejs.renderFile(templatePath, {
      user: {
        name: user.name || 'Valued Customer',
        email: user.email
      },
      otp: otp
    });

    // Send email using either mock or real email service
    if (USE_MOCK_EMAIL) {
      console.log('📧 Using mock email service for OTP');
      await mockSendEmail(user.email, 'Your OTP Code - LacedUp', html);
    } else {
      await sendEmail(user.email, 'Your OTP Code - LacedUp', html);
    }
    
    console.log(`✅ OTP email sent successfully to ${user.email}`);
    
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    
    // If EJS template rendering fails, fall back to basic HTML
    if (error.code === 'ENOENT' || error.message.includes('template')) {
      console.log('⚠️  Template not found, falling back to basic HTML');
      
      const fallbackHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Your OTP Code</h2>
          <p>Hello ${user.name || 'Valued Customer'},</p>
          <p>Your OTP code is: <strong style="font-size: 24px; color: #667eea;">${otp}</strong></p>
          <p style="color: #856404; background-color: #fff3cd; padding: 10px; border-radius: 5px;">
            ⏰ This code will expire in 2 minutes.
          </p>
          <p style="color: #666;">— LacedUp Co. Team</p>
        </div>
      `;
      
      if (USE_MOCK_EMAIL) {
        await mockSendEmail(user.email, 'Your OTP Code - LacedUp', fallbackHtml);
      } else {
        await sendEmail(user.email, 'Your OTP Code - LacedUp', fallbackHtml);
      }
      
      console.log(`✅ Fallback OTP email sent successfully to ${user.email}`);
    } else {
      // Re-throw the error if it's not a template-related issue
      throw error;
    }
  }
};
