const sendEmail = require('./sendEmail');
const mockSendEmail = require('./mockEmail');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

// Use mock email if EMAIL_USER is not configured or if MOCK_EMAIL is set to true
const USE_MOCK_EMAIL = !process.env.EMAIL_USER || process.env.MOCK_EMAIL === 'true';

// Pre-compile template for faster rendering
const templatePath = path.join(__dirname, '..', 'views', 'user', 'partials', 'otp-email.ejs');
let compiledTemplate = null;
let fallbackHtml = null;

// Initialize template and fallback HTML
const initializeTemplate = async () => {
  try {
    if (fs.existsSync(templatePath)) {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      compiledTemplate = ejs.compile(templateContent);
    } else {
      console.warn('⚠️ OTP email template not found, using fallback HTML');
    }
  } catch (error) {
    console.warn('⚠️ Failed to pre-compile OTP template:', error.message);
  }
  
  // Pre-generate fallback HTML template
  fallbackHtml = (user, otp) => `
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
};

// Initialize on module load
initializeTemplate();

/**
 * Sends OTP email using pre-compiled template for faster performance
 * @param {Object} user - User object containing email and name
 * @param {string} otp - The OTP code to send
 * @throws {Error} If email sending fails
 */
module.exports = async function sendOtp(user, otp) {
  try {
    let html;
    
    // Use pre-compiled template for faster rendering
    if (compiledTemplate) {
      html = compiledTemplate({
        user: {
          name: user.name || 'Valued Customer',
          email: user.email
        },
        otp: otp
      });
    } else {
      // Use fallback HTML if template compilation failed
      html = fallbackHtml(user, otp);
    }

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
    
    // Fallback to basic HTML if template rendering fails
    try {
      const basicHtml = fallbackHtml(user, otp);
      
      if (USE_MOCK_EMAIL) {
        await mockSendEmail(user.email, 'Your OTP Code - LacedUp', basicHtml);
      } else {
        await sendEmail(user.email, 'Your OTP Code - LacedUp', basicHtml);
      }
      
      console.log(`✅ Fallback OTP email sent successfully to ${user.email}`);
    } catch (fallbackError) {
      console.error('❌ Fallback email also failed:', fallbackError);
      throw error; // Re-throw original error
    }
  }
};
