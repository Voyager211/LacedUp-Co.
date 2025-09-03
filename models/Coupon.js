const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    minimumOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    maximumDiscountAmount: {
        type: Number, // For percentage discounts
        default: null
    },
    usageLimit: {
        type: Number,
        default: null // null = unlimited usage
    },
    usedCount: {
        type: Number,
        default: 0
    },
    userLimit: {
        type: Number,
        default: 1 // How many times one user can use this coupon
    },
    validFrom: {
        type: Date,
        required: true
    },
    validTo: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        }
    }]
}, {
    timestamps: true
});

// Index for efficient queries
couponSchema.index({ code: 1 });
couponSchema.index({ validFrom: 1, validTo: 1 });
couponSchema.index({ isActive: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
