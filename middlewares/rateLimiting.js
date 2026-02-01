const rateLimit = require('express-rate-limit');

const couponRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 coupon attempts per windowMs
    message: 'Too many coupon attempts, please try again later.'
});

module.exports = { couponRateLimit };