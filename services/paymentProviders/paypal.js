const paypal = require('@paypal/checkout-server-sdk');
require('dotenv').config();

// Sandbox environment (switch to LiveEnvironment with live keys later)
const environment = new paypal.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_CLIENT_SECRET
);

// Re-usable client instance
const paypalClient = new paypal.core.PayPalHttpClient(environment);

module.exports = { paypalClient };
