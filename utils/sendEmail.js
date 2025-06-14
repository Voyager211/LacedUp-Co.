const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail', // or SendGrid / Mailgun
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"LacedUp Co." <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error(`❌ Email sending failed to ${to}:`, err);
    throw err;
  }
};
