const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referralCode: {
        type: String,
        required: true
    },
    rewardAmount: {
        type: Number,
        default: 100 // ₹100 wallet credit
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'pending'
    },
    rewardGivenAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

referralSchema.index({ referrer: 1 });
referralSchema.index({ referee: 1 });

module.exports = mongoose.model('Referral', referralSchema);
