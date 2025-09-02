const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpayClient = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * Create Razorpay order
 * @param {Number} amount - Amount in INR (will be converted to paise)
 * @param {String} currency - Currency code (default: INR)
 * @param {String} receipt - Receipt ID (optional)
 * @returns {Object} - Razorpay order object
 */
const createOrder = async (amount, currency = 'INR', receipt = null) => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise (smallest currency unit)
      currency: currency,
      receipt: receipt || `order_rcptid_${Date.now()}`,
      notes: {
        created_at: new Date().toISOString()
      }
    };

    console.log('🔄 Creating Razorpay order with options:', options);
    
    const order = await razorpayClient.orders.create(options);
    
    console.log('✅ Razorpay order created:', order.id);
    
    return {
      success: true,
      order: order
    };
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Verify payment signature
 * @param {String} paymentId - Razorpay payment ID
 * @param {String} orderId - Razorpay order ID
 * @param {String} signature - Payment signature from frontend
 * @returns {Boolean} - True if signature is valid
 */
const verifyPaymentSignature = (paymentId, orderId, signature) => {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isValid = expectedSignature === signature;
    
    console.log(isValid ? '✅ Payment signature verified' : '❌ Invalid payment signature');
    
    return isValid;
  } catch (error) {
    console.error('❌ Error verifying payment signature:', error);
    return false;
  }
};

/**
 * Fetch payment details
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Object} - Payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpayClient.payments.fetch(paymentId);
    
    return {
      success: true,
      payment: payment
    };
  } catch (error) {
    console.error('❌ Error fetching payment details:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create refund
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number} amount - Refund amount in INR (optional, full refund if not provided)
 * @returns {Object} - Refund details
 */
const createRefund = async (paymentId, amount = null) => {
  try {
    const refundOptions = {
      payment_id: paymentId
    };
    
    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }
    
    const refund = await razorpayClient.payments.refund(paymentId, refundOptions);
    
    console.log('✅ Refund created:', refund.id);
    
    return {
      success: true,
      refund: refund
    };
  } catch (error) {
    console.error('❌ Error creating refund:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Fetch order details
 * @param {String} orderId - Razorpay order ID
 * @returns {Object} - Order details
 */
const getOrderDetails = async (orderId) => {
  try {
    const order = await razorpayClient.orders.fetch(orderId);
    
    return {
      success: true,
      order: order
    };
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  razorpayClient,
  createOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  createRefund,
  getOrderDetails
};
