const crypto = require('crypto');
const User = require('../models/User');

/**
 * Generate a unique referral code for a user
 * Format: 6-character alphanumeric code (e.g., ABC123)
 */
async function generateReferralCode(userId) {
  const maxAttempts = 5;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Generate 6-character code using user ID + random string
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = randomPart.substring(0, 6);

    // Check if code already exists
    const existing = await User.findOne({ referralCode: code });
    
    if (!existing) {
      return code;
    }

    attempts++;
  }

  // Fallback: use timestamp-based code
  const timestamp = Date.now().toString(36).toUpperCase();
  return timestamp.substring(timestamp.length - 6);
}

module.exports = { generateReferralCode };
