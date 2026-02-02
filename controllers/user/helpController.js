const sendEmail = require('../../utils/sendEmail');

// GET Help Page
const getHelpPage = (req, res) => {
  try {
    res.render('user/help', {
      title: 'Help & Support - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'home',
    });
  } catch (error) {
    console.error('Error rendering help page:', error);
    res.status(500).render('error', { 
      message: 'Failed to load help page' 
    });
  }
};

// POST Contact Form
const submitContactForm = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    // Send acknowledgment email to user
    const userEmailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
          }
          .container {
            background-color: #f9f9f9;
            padding: 30px;
            border-radius: 10px;
          }
          .header {
            background: linear-gradient(135deg, #e03a2f 0%, #c82e24 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #e03a2f;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 Support Ticket Received</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thank you for reaching out to LacedUp! We've received your message and our support team is reviewing it.</p>
            
            <p><strong>Your Message Details:</strong></p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong> ${message}</p>
            
            <p>We typically respond within 24 hours during business days. Our team will get back to you at <strong>${email}</strong> as soon as possible.</p>
            
            <p>In the meantime, you can:</p>
            <ul>
              <li>Browse our <a href="https://lacedup.com/help">FAQ section</a> for quick answers</li>
              <li>Check your order status in your account</li>
              <li>Explore our latest sneaker drops</li>
            </ul>
            
            <p>Thanks for being part of the LacedUp family!</p>
            
            <p><strong>The LacedUp Team</strong><br>
            Where Style Meets Passion</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} LacedUp. All rights reserved.</p>
            <p>Kanayannur, Kerala, India</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send notification to admin
    const adminEmailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #e03a2f;
            color: white;
            padding: 20px;
            border-radius: 5px;
          }
          .content {
            background-color: #f9f9f9;
            padding: 20px;
            margin-top: 10px;
            border-radius: 5px;
          }
          .detail {
            margin-bottom: 15px;
          }
          .detail strong {
            display: inline-block;
            width: 100px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🎫 New Support Ticket</h2>
          </div>
          <div class="content">
            <h3>Customer Contact Form Submission</h3>
            
            <div class="detail">
              <strong>Name:</strong> ${name}
            </div>
            <div class="detail">
              <strong>Email:</strong> ${email}
            </div>
            <div class="detail">
              <strong>Subject:</strong> ${subject}
            </div>
            <div class="detail">
              <strong>Message:</strong><br>
              ${message}
            </div>
            <div class="detail">
              <strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      // Send acknowledgment to user
      await sendEmail(
        email,
        'Your Support Ticket Has Been Received - LacedUp',
        userEmailHTML
      );

      // Send notification to admin
      await sendEmail(
        process.env.EMAIL_USER,
        `New Support Ticket from ${name} - ${subject}`,
        adminEmailHTML
      );

      res.json({
        success: true,
        message: 'Message sent successfully! Check your email for confirmation.'
      });

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Still return success to user if form was received
      res.json({
        success: true,
        message: 'Message received! We\'ll respond shortly.'
      });
    }

  } catch (error) {
    console.error('Error handling contact form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process your request. Please try again later.'
    });
  }
};

module.exports = {
    getHelpPage,
    submitContactForm
}