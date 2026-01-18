const Razorpay = require('razorpay');
const crypto = require('crypto');

//  Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

//  Create Razorpay Order
const createRazorpayOrder = async (orderId, amount) => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: orderId,
      payment_capture: 1,
      notes: { orderId }
    };

    const order = await razorpayInstance.orders.create(options);
    return order;
  } catch (error) {
    throw new Error(`Failed to create Razorpay order: ${error.message}`);
  }
};

//  Verify Payment Signature
const verifyPaymentSignature = (razorpayOrderId, paymentId, signature) => {
  try {
    const body = razorpayOrderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

//  Fetch Payment Details
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpayInstance.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    throw new Error(`Failed to fetch payment: ${error.message}`);
  }
};



module.exports = {
  razorpayInstance,
  createRazorpayOrder,
  verifyPaymentSignature,
  getPaymentDetails,
};
