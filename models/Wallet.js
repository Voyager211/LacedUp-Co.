const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true
    },
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    transactions: [
      {
        transactionId: {
          type: String,
          required: true
          // ✅ REMOVED: unique constraint - enforced at app level instead
        },
        type: {
          type: String,
          enum: ['credit', 'debit'],
          required: true
        },
        amount: {
          type: Number,
          required: true,
          min: 0
        },
        description: {
          type: String,
          required: true
        },
        paymentMethod: {
          type: String,
          enum: ['razorpay', 'manual_credit', 'refund', 'payment_for_order', 'referral_reward'],
          required: true
        },
        status: {
          type: String,
          enum: ['pending', 'completed', 'failed'],
          default: 'completed'
        },
        // Order and return references (optional)
        orderId: {
          type: String
        },
        returnId: {
          type: String
        },
        // Razorpay specific fields
        razorpayOrderId: {
          type: String
        },
        razorpayPaymentId: {
          type: String
        },
        // Balance tracking
        balanceAfter: {
          type: Number,
          required: true
        },
        // Timestamp
        date: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// ✅ Generate unique transaction ID for new transactions
walletSchema.pre('save', function (next) {
  this.transactions.forEach((transaction) => {
    if (!transaction.transactionId) {
      // Format: TXN{timestamp}{random}{uuid snippet}
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      transaction.transactionId = `TXN${timestamp}${random}`;
    }
  });
  next();
});

// ✅ Virtual to get latest transaction
walletSchema.virtual('latestTransaction').get(function () {
  return this.transactions.length > 0
    ? this.transactions[this.transactions.length - 1]
    : null;
});

// ✅ Virtual to get total transaction count
walletSchema.virtual('transactionCount').get(function () {
  return this.transactions.length;
});

// ✅ Virtual to get total credits
walletSchema.virtual('totalCredits').get(function () {
  return this.transactions
    .filter((t) => t.type === 'credit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
});

// ✅ Virtual to get total debits
walletSchema.virtual('totalDebits').get(function () {
  return this.transactions
    .filter((t) => t.type === 'debit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
});

// ✅ Enable virtuals in JSON output
walletSchema.set('toJSON', { virtuals: true });

// ============================================
// INDEXES - Optimized for Performance
// ============================================

// Primary index for user wallet lookups
walletSchema.index({ userId: 1 });

// ✅ COMPOUND INDEXES: For common query patterns
walletSchema.index({ userId: 1, updatedAt: -1 }); // User wallets by last update
walletSchema.index({ userId: 1, balance: -1 }); // User wallet balance queries

// ✅ TRANSACTION INDEXES: For efficient transaction queries
walletSchema.index({ 'transactions.date': -1 }); // Latest transactions first
walletSchema.index({ 'transactions.transactionId': 1 }); // Transaction lookups
walletSchema.index({ 'transactions.type': 1, 'transactions.date': -1 }); // Filter by type + date
walletSchema.index({ 'transactions.status': 1 }); // Filter by status

// ✅ ORDER & RETURN RELATED TRANSACTIONS
walletSchema.index({ 'transactions.orderId': 1 }, { sparse: true });
walletSchema.index({ 'transactions.returnId': 1 }, { sparse: true });

// ✅ RAZORPAY PAYMENT TRACKING
walletSchema.index({ 'transactions.razorpayPaymentId': 1 }, { sparse: true });
walletSchema.index({ 'transactions.razorpayOrderId': 1 }, { sparse: true });

// ✅ PAGINATION INDEX: For wallet transaction page (userId + date sorted)
walletSchema.index({ userId: 1, 'transactions.date': -1 });

// ✅ PAYMENT METHOD TRACKING
walletSchema.index(
  { userId: 1, 'transactions.paymentMethod': 1, 'transactions.date': -1 },
  { sparse: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
