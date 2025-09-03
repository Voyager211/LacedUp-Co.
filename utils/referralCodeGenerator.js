const crypto = require('crypto');
const User = require('../models/User');

const generateReferralCode = async (userId) => {
    // Create a unique code based on user ID and random string
    const randomString = crypto.randomBytes(4).toString('hex').toUpperCase();
    const userIdStr = userId.toString().slice(-4).toUpperCase();
    const referralCode = `LAC${userIdStr}${randomString}`;
    
    // Check if code already exists
    const existingUser = await User.findOne({ referralCode });
    if (existingUser) {
        // Recursively generate new code if collision
        return generateReferralCode(userId);
    }
    
    return referralCode;
};

module.exports = { generateReferralCode };