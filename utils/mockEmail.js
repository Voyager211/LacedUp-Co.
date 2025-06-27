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
    const logEntry = {
      timestamp,
      to,
      subject,
      html,
      status: 'sent'
    };

    // Log to console
    console.log(`📧 MOCK EMAIL SENT:`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Time: ${timestamp}`);
    
    // Extract OTP from HTML if present
    const otpMatch = html.match(/<strong>(\d{6})<\/strong>/);
    if (otpMatch) {
      console.log(`   🔑 OTP: ${otpMatch[1]}`);
    }

    // Save to log file
    const logFile = path.join(logsDir, 'mock-emails.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    console.log(`✅ Mock email logged successfully`);
  } catch (err) {
    console.error(`❌ Mock email logging failed:`, err);
    throw err;
  }
};
