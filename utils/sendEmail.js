const nodemailer = require('nodemailer');

// Create transporter with better error handling and configuration
const createTransporter = () => {
  // Check if email credentials are provided
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Email credentials not found in environment variables');
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  });
};

const transporter = createTransporter();

// Test function to verify email configuration
const testEmailConfig = async () => {
  try {
    if (!transporter) {
      console.error('❌ Email transporter not initialized');
      return false;
    }

    console.log('🔍 Testing email configuration...');
    console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
    console.log('🔑 EMAIL_PASS length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 'undefined');

    await transporter.verify();
    console.log('✅ Email configuration verified successfully');
    return true;
  } catch (err) {
    console.error('❌ Email configuration test failed:', err.message);
    return false;
  }
};

module.exports = async function sendEmail(to, subject, html) {
  try {
    // Check if transporter is available
    if (!transporter) {
      throw new Error('Email service not configured. Please check EMAIL_USER and EMAIL_PASS environment variables.');
    }

    // Verify transporter configuration before sending
    console.log('🔍 Verifying email configuration before sending...');
    await transporter.verify();
    console.log('✅ Email configuration verified, sending email...');

    await transporter.sendMail({
      from: `"LacedUp Co." <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log(`✅ Email sent successfully to ${to}`);
  } catch (err) {
    console.error(`❌ Email sending failed to ${to}:`, err);
    console.error('❌ Error details:', {
      code: err.code,
      command: err.command,
      response: err.response
    });

    // Provide more specific error messages
    if (err.code === 'EAUTH') {
      throw new Error('Email authentication failed. Please check your Gmail App Password or enable 2-factor authentication.');
    } else if (err.code === 'ECONNECTION') {
      throw new Error('Failed to connect to email server. Please check your internet connection.');
    } else {
      throw err;
    }
  }
};

// Export test function for debugging
module.exports.testEmailConfig = testEmailConfig;
