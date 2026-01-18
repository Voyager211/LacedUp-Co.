const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'ORDER_PAYMENT',    // Payment for placing an order
      'WALLET_CREDIT',    // Adding money to wallet
      'WALLET_DEBIT',
      'WALLET_TOPUP',     // Wallet payment for order
      'REFUND',          // Refund to wallet/original source
      'CANCELLATION_REFUND' // Refund due to order cancellation
    ],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'paypal', 'wallet', 'cod', 'card', 'netbanking'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },
  status: {
    type: String,
    enum: [
      'INITIATED',    // Transaction created, payment not started
      'PENDING',      // Payment gateway initiated
      'PROCESSING',   // Payment being processed
      'COMPLETED',    // Payment successful
      'FAILED',       // Payment failed
      'CANCELLED',    // User cancelled payment
      'EXPIRED',      // Payment session expired
      'REFUNDED'      // Amount refunded
    ],
    default: 'INITIATED',
    index: true
  },
  
  // Payment Gateway Details
  gatewayDetails: {
    // Razorpay
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    
    // PayPal
    paypalOrderId: String,
    paypalCaptureId: String,
    
    // Gateway response data
    gatewayResponse: {
      type: Object,
      default: {}
    }
  },
  
  // Order Association (only set after successful payment)
  orderId: {
    type: String,
    default: null,
    index: true
  },
  
  // Cart Data (stored temporarily until payment success)
  orderData: {
    deliveryAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      required: function() {
        // Only require for ORDER_PAYMENT transactions
        return this.type === 'ORDER_PAYMENT';
      }
    },
    items: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: function() {
          // Only require for ORDER_PAYMENT transactions
          return this.parent().parent().type === 'ORDER_PAYMENT';
        }
      },
      variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: function() {
          // Only require for ORDER_PAYMENT transactions
          return this.parent().parent().type === 'ORDER_PAYMENT';
        }
      },
      sku: String,
      size: String,
      quantity: Number,
      price: Number,
      totalPrice: Number,
      regularPrice: Number
    }],
    pricing: {
      subtotal: Number,
      totalDiscount: Number,
      amountAfterDiscount: Number,
      shipping: Number,
      total: Number,
      totalItemCount: Number
    }
  },
  
  // Transaction Metadata
  metadata: {
    failureReason: String,
    failureCode: String,
    retryCount: {
      type: Number,
      default: 0
    },
    userAgent: String,
    ipAddress: String,
    sessionId: String
  },
  
  // Audit Trail
  statusHistory: [{
    status: {
      type: String,
      enum: ['INITIATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    notes: String,
    updatedBy: String
  }],
  
  // Expiry for cleanup
  expiresAt: {
    type: Date,
    default: function() {
      // Expire after 24 hours for failed/cancelled transactions
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    },
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
transactionSchema.index({ userId: 1, status: 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

// Middleware to update status history
transactionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      updatedAt: new Date(),
      notes: `Status changed to ${this.status}`
    });
  }
  next();
});

// Instance methods
transactionSchema.methods.updateStatus = function(newStatus, notes = '', updatedBy = null) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    updatedAt: new Date(),
    notes: notes,
    updatedBy: updatedBy
  });
  
  // Remove expiry for completed transactions
  if (newStatus === 'COMPLETED') {
    this.expiresAt = undefined;
  }
  
  return this.save();
};

transactionSchema.methods.markAsCompleted = function(orderId, notes = '') {
  this.status = 'COMPLETED';
  this.orderId = orderId;
  this.expiresAt = undefined; // Remove expiry
  this.statusHistory.push({
    status: 'COMPLETED',
    updatedAt: new Date(),
    notes: notes || `Transaction completed for order ${orderId}`
  });
  return this.save();
};

transactionSchema.methods.markAsFailed = function(reason, code = null) {
  this.status = 'FAILED';
  this.metadata.failureReason = reason;
  this.metadata.failureCode = code;
  this.statusHistory.push({
    status: 'FAILED',
    updatedAt: new Date(),
    notes: `Transaction failed: ${reason}`
  });
  return this.save();
};

// Static methods
transactionSchema.statics.findByTransactionId = function(transactionId) {
  return this.findOne({ transactionId: transactionId });
};

transactionSchema.statics.findPendingByUser = function(userId) {
  return this.find({ 
    userId: userId, 
    status: { $in: ['INITIATED', 'PENDING', 'PROCESSING'] } 
  }).sort({ createdAt: -1 });
};

transactionSchema.statics.getUserTransactionHistory = function(userId, limit = 50, skip = 0) {
  return this.find({ userId: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'name email');
};

module.exports = mongoose.model('Transaction', transactionSchema);
