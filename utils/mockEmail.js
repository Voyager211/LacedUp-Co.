// Mock email service for testing when Gmail is not working
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = async function mockSendEmail(to, subject, html) {
  try {
    const timestamp = new Date().toISOString();
    
    // Log to console (faster than file operations)
    console.log(` MOCK EMAIL SENT:`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Time: ${timestamp}`);
    
    // Extract OTP from HTML if present
    const otpMatch = html.match(/<strong[^>]*>(\d{6})<\/strong>/);
    if (otpMatch) {
      console.log(`    OTP: ${otpMatch[1]}`);
    }

    // Async file logging to avoid blocking (optional, faster without it)
    if (process.env.MOCK_EMAIL_LOG === 'true') {
      const logEntry = {
        timestamp,
        to,
        subject,
        otp: otpMatch ? otpMatch[1] : null,
        status: 'sent'
      };
      
      const logFile = path.join(logsDir, 'mock-emails.log');
      // Use async write to avoid blocking
      fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) console.warn('Mock email log write failed:', err.message);
      });
    }

    console.log(` Mock email sent successfully (instant)`);
  } catch (err) {
    console.error(` Mock email failed:`, err);
    throw err;
  }
};