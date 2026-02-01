const Coupon = require('../models/Coupon');

const validateCoupon = async (couponCode, userId, orderTotal) => {
    try {
        const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            isActive: true 
        });

        if (!coupon) {
            return { valid: false, message: 'Invalid coupon code' };
        }

        // ✅ FIXED: Improved date validation with inclusive day comparison
        const now = new Date();
        const validFromDate = new Date(coupon.validFrom);
        const validToDate = new Date(coupon.validTo);
        
        // Set start of day for validFrom (00:00:00)
        validFromDate.setHours(0, 0, 0, 0);
        
        // Set end of day for validTo (23:59:59)
        validToDate.setHours(23, 59, 59, 999);
        
        if (now < validFromDate || now > validToDate) {
            return { valid: false, message: 'Coupon has expired or is not yet active' };
        }

        // Check usage limit
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return { valid: false, message: 'Coupon usage limit exceeded' };
        }

        // Check minimum order value
        if (orderTotal < coupon.minimumOrderValue) {
            return { 
                valid: false, 
                message: `Minimum order value of ₹${coupon.minimumOrderValue} required` 
            };
        }

        // Check user-specific usage limit
        const userUsage = coupon.usedBy.filter(usage => 
            usage.user.toString() === userId.toString()
        ).length;
        
        if (userUsage >= coupon.userLimit) {
            return { valid: false, message: 'You have already used this coupon' };
        }

        return { valid: true, coupon };
    } catch (error) {
        console.error('Error validating coupon:', error);
        return { valid: false, message: 'Error validating coupon' };
    }
};

const calculateDiscount = (coupon, orderTotal) => {
    let discountAmount = 0;
    
    if (coupon.discountType === 'percentage') {
        discountAmount = (orderTotal * coupon.discountValue) / 100;
        
        // Apply maximum discount limit if set
        if (coupon.maximumDiscountAmount && discountAmount > coupon.maximumDiscountAmount) {
            discountAmount = coupon.maximumDiscountAmount;
        }
    } else if (coupon.discountType === 'fixed') {
        discountAmount = coupon.discountValue;
        
        // Don't allow discount to exceed order total
        if (discountAmount > orderTotal) {
            discountAmount = orderTotal;
        }
    }
    
    return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
};

module.exports = { validateCoupon, calculateDiscount };