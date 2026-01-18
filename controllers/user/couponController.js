const Coupon = require('../../models/Coupon');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');

// helper function to calculate variant specific final price
const calculateVariantFinalPrice = (product, variant) => {
    try {
        if (typeof product.calculateVariantFinalPrice === 'function') {
            return product.calculateVariantFinalPrice(variant);
        }
        return variant.basePrice || product.regularPrice || 0;

    } catch (error) {
        console.error('Error calculating variant price:', error);
        return variant.basePrice || product.regularPrice || 0;   
    }
};

// calculate cart totals
const calculateCartTotals = async (userId) => {
    try {
        const cart = await Cart.findOne ({ userId })
            .populate({
                path: 'items.productId',
                populate: [
                    { path: 'category', select: 'name isListed isDeleted categoryOffer' },
                    { path: 'brand', select: 'name brandOffer isActive isDeleted' }
                ]
            });

        if (!cart || !cart.items || cart.items.length === 0 ) {
            return {
                success: false,
                message: 'Cart is empty',
                totals: null
            }
        }

        // filter out unavailable items
        const validItems = cart.items.filter(item => {
            if (!item.productId || !item.productId.isListed || item.productId.isDeleted) return false;
            if (item.productId.category && (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) return false;
            if (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) return false;

            if (item.variantId) {
                const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
                if (!variant || variant.stock === 0 || variant.stock < item.quantity) return false;
            }

            return true;
        });

        let subtotal = 0;
        let totalDiscount = 0;
        let totalItemCount = 0;

        // calculate totals
        validItems.forEach(item => {
            const regularPrice = item.productId.regularPrice;
            const salePrice = item.variantId ?
                calculateVariantFinalPrice(item.productId, item.productId.variants.find(v => v._id.toString() === item.variantId.toString())) :
                regularPrice;

            const quantity = item.quantity;
            subtotal += (regularPrice * quantity);
            totalItemCount += quantity;

            const itemDiscount = (regularPrice - salePrice) * quantity;
            totalDiscount += Math.max(0, itemDiscount);
        });

        // calculate shipping
        const amountAfterDiscount = subtotal - totalDiscount;
        const shipping = amountAfterDiscount >= 500 ? 0 : 50;
        const total = amountAfterDiscount + shipping;

        return {
            success: true,
            totals: {
                subtotal: Math.round(subtotal),
                totalDiscount: Math.round(totalDiscount),
                amountAfterDiscount: Math.round(amountAfterDiscount),
                shipping: shipping,
                total: Math.round(total),
                totalItemCount: totalItemCount,
                validItemsCount: validItems.length
            }
        };

    } catch (error) {
        console.error('Error calculating cart totals:', error);
        return {
            success: false,
            message: 'Error calculating cart totals',
            totals: null
        };
    }
};

function validateCouponConditions  (coupon, orderTotal, userId, session) {
    const currentDate = new Date();

    // check if coupon is expired
    if (currentDate < coupon.validFrom) {
        return {
            isValid: false,
            message: 'Coupon is not yet valid'
        };
    }

    if (currentDate > coupon.validTo) {
        return {
            isValid: false,
            message: 'Coupon has expired'
        }
    }

    // check min order value
    if (coupon.minimumOrderValue && orderTotal < coupon.minimumOrderValue) {
        return {
            isValid: false,
            message: `Minimum order value of Rs.${coupon.minimumOrderValue} required`
        };
    }

    // check usage limit
    if (coupon.usageLimit !== Infinity && coupon.usedCount >= coupon.usageLimit) {
        return {
            isValid: false,
            message: 'Coupon usage limit reached'
        };
    }

    // check if user has already applied a coupon
    if (session.appliedCoupon) {
        return {
            isValid: false,
            message: 'Please remove the current coupon before applying a new one'
        };
    }

    // checkuser specific usage limit
    if (userId && coupon.userLimit) {
        const userUsageCount = coupon.usedBy?.filter(usage => 
            usage.user.toString() === userId.toString()
        ).length || 0;

        if (userUsageCount >= coupon.userLimit) {
            return {
                isValid: false,
                message: 'You have already used this coupon the maximum number of times'
            };
        }
    }

    return {
        isValid: true,
        message: 'Coupon is valid'
    };
}

//calculate discount amount
function calculateDiscount(coupon, orderTotal) {
    let discountAmount = 0;

    if (coupon.discountType === 'percentage') {
        discountAmount = (orderTotal * coupon.discountValue) / 100;

        // apply max discount limit
        if (coupon.maximumDiscountAmount && discountAmount > coupon.maximumDiscountAmount) {
            discountAmount = coupon.maximumDiscountAmount;
        } 

    } else if (coupon.discountType === 'fixed') {
        discountAmount = coupon.discountValue;

        if (discountAmount > orderTotal) {
            discountAmount = orderTotal;
        }
    }

    return {
        discountAmount: Math.round(discountAmount * 100) / 100,
        discountType: coupon.discountType,
        originalValue: coupon.discountValue,
        appliedValue: discountAmount
    };
}


const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user?.id || req.session.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        console.log('Fetching available coupons for user');

        const currentDate = new Date();
        
        const coupons = await Coupon.find({
            isActive: true,
            
            validFrom: { $lte: currentDate },
            validTo: { $gte: currentDate }
        })
        .select('code name description discountType discountValue minimumOrderValue maximumDiscountAmount usageLimit usedCount userLimit validFrom validTo isActive usedBy')
        .sort({ createdAt: -1 });

        // filter out coupons that reached limits
        const availableCoupons = coupons.filter(coupon => {
            // total limit
            if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
                console.log(`Coupon ${coupon.code} excluded: Total usage limit reached`);
                return false;
            }

            // per user limit
            if (coupon.userLimit !== null) {
                const userUsageCount = coupon.usedBy.filter(
                    usage => usage.user.toString() === userId.toString()
                ).length;

                if (userUsageCount >= coupon.userLimit) {
                    console.log(`Coupon ${coupon.code} excluded: User has reached usage limit (${userUsageCount}/${coupon.userLimit})`);
                    return false;
                }
            }

            return true;
        });

        console.log(`Found ${availableCoupons.length} available coupons`);

        const couponsToSend = availableCoupons.map(coupon => {
            const couponObj = coupon.toObject();
            delete couponObj.usedBy;
            return couponObj;
        });

        res.status(200).json({
            success: true,
            message: 'Available coupons fetched successfully',
            data: {
                coupons: couponsToSend,
                count: couponsToSend.length
            }
        });

    } catch (error) {
        console.error('Error fetching available coupons: ', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available coupons',
            error: error.message
        });
    }
}

const applyCoupon = async (req, res) => {
    try {
        const { couponCode, orderTotal } = req.body;
        const userId = req.user?.id || req.session.userId;

        console.log('Applying coupon:', couponCode, 'for order total:', orderTotal);

        // validation
        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        // calculate cart totals
        const cartTotalsResult = await calculateCartTotals(userId);

        if (!cartTotalsResult.success) {
            return res.status(400).json({
                success: false,
                message: cartTotalsResult.message
            });
        }

        const actualOrderTotal = cartTotalsResult.totals.amountAfterDiscount;

        if (actualOrderTotal <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid cart total. Please refresh and try again'
            });
        }
        
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or inactive coupon code'
            });
        }

        // validate coupon conditions
        const validation = validateCouponConditions(coupon, actualOrderTotal, userId, req.session);

        if(!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        // calculate discont
        const discountCalculation = calculateDiscount(coupon, actualOrderTotal);

        // store applied coupon in session
        req.session.appliedCoupon = {
            _id: coupon._id,
            code: coupon.code,
            name: coupon.name,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount: discountCalculation.discountAmount,
            appliedAt: new Date(),
            originalCartTotals: cartTotalsResult.totals
        }

        const finalTotal = Math.max(0, cartTotalsResult.totals.total - discountCalculation.discountAmount);

        const orderSummary = {
            subtotal: cartTotalsResult.totals.subtotal,
            totalDiscount: cartTotalsResult.totals.totalDiscount,
            amountAfterDiscount: cartTotalsResult.totals.amountAfterDiscount,
            couponDiscount: discountCalculation.discountAmount,
            shipping: cartTotalsResult.totals.shipping,
            finalTotal: finalTotal
        };

        console.log('Coupon applied successfully:', {
            code: coupon.code,
            discount: discountCalculation.discountAmount,
            newTotal: orderSummary.finalTotal
        });

        res.status(200).json({
            success: true,
            message: `Coupon "${coupon.code}" applied successfully! You saved Rs.${discountCalculation.discountAmount.toFixed(2)}`,
            data: {
                appliedCoupon: {
                    _id: coupon._id,
                    code: coupon.code,
                    name: coupon.name,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    discountAmount: discountCalculation.discountAmount
                },
                orderSummary: orderSummary,
                discountDetails: discountCalculation
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error applying coupon',
            error: error.message
        });   
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.user?.id || req.session.userId;

        console.log('Removing applied coupon from session');

        if (!req.session.appliedCoupon) {
            return res.status(400).json({
                success: false,
                message: 'No coupon is currently applied'
            });
        }

        const removedCoupon = req.session.appliedCoupon;

        const cartTotalsResult = await calculateCartTotals(userId);

        if (!cartTotalsResult.success) {
            return res.status(400).json({
                success: false,
                message: cartTotalsResult.message
            });
        }

        // remove coupon from session
        delete req.session.appliedCoupon;

        // return order summary without coupon
        const orderSummary = {
            subtotal: cartTotalsResult.totals.subtotal,
            totalDiscount: cartTotalsResult.totals.totalDiscount,
            amountAfterDiscount: cartTotalsResult.totals.amountAfterDiscount,
            couponDiscount: 0,
            shipping: cartTotalsResult.totals.shipping,
            finalTotal: cartTotalsResult.totals.total
        };

        console.log('Coupon removed successfully:', removedCoupon.code);

        res.status(200).json({
            success: true,
            message: `Coupon "${removedCoupon.code}" removed successfully!`,
            data: {
                removedCoupon: {
                    code: removedCoupon.code,
                    name: removedCoupon.name,
                    discountAmount: removedCoupon.discountAmount
                },
                orderSummary
            }
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing coupon',
            error: error.message
        });
    }
}

const updateCouponUsage = async (couponId, userId, orderId = null) => {
    try {
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            console.error('Coupon not found for usage update:', couponId);
            return false;
        }

        // increment coupon used count
        coupon.usedCount += 1;

        // add user to usedBy array
        if (userId) {
            coupon.usedBy.push({
                userId: userId,
                usedAt: new Date(),
                orderId: orderId
            });
        }

        await coupon.save();

        console.log(`Updated coupon usage: ${coupon.code}, used count: ${coupon.usedCount}`);
        return true;

    } catch (error) {
        console.error('Error updating coupon usage', error);
        return false;
    }
}

module.exports = {
    getAvailableCoupons,
    applyCoupon,
    removeCoupon,
    updateCouponUsage,
    calculateCartTotals
}