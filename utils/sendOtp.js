const sendEmail = require('./sendEmail');

module.exports = async function sendOtp(user, otp) {
  const html = `
    <p>Hello ${user.name || ''},</p>
    <p>Your OTP code is: <strong>${otp}</strong></p>
    <p>This code will expire in 2 minutes.</p>
    <p>— LacedUp Co. Team</p>
  `;
  await sendEmail(user.email, 'Your OTP Code', html);
};
