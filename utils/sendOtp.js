const sendEmail = require('./sendEmail');
const mockSendEmail = require('./mockEmail');

// Use mock email if EMAIL_USER is not configured or if MOCK_EMAIL is set to true
const USE_MOCK_EMAIL = !process.env.EMAIL_USER || process.env.MOCK_EMAIL === 'true';

module.exports = async function sendOtp(user, otp) {
  const html = `
    <p>Hello ${user.name || ''},</p>
    <p>Your OTP code is: <strong>${otp}</strong></p>
    <p>This code will expire in 2 minutes.</p>
    <p>— LacedUp Co. Team</p>
  `;

  if (USE_MOCK_EMAIL) {
    console.log('📧 Using mock email service for OTP');
    await mockSendEmail(user.email, 'Your OTP Code', html);
  } else {
    await sendEmail(user.email, 'Your OTP Code', html);
  }
};
