const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    unique: true
    // ✅ REMOVED: individual index (using compound index instead)
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [{
    transactionId: {
      type: String,
      required: true,
      unique: true
      // ✅ REMOVED: individual index (MongoDB automatically indexes unique fields)
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
    orderId: {
      type: String
    },
    returnId: {
      type: String
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed'
    },
    date: {
      type: Date,
      default: Date.now
      // ✅ REMOVED: individual index (using compound index instead)
    },
    balanceAfter: {
      type: Number,
      required: true
    }
  }]
}, {
  timestamps: true
});

// Generate unique transaction ID for new transactions
walletSchema.pre('save', function(next) {
  this.transactions.forEach(transaction => {
    if (!transaction.transactionId) {
      transaction.transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }
  });
  next();
});

// Virtual to get latest transaction
walletSchema.virtual('latestTransaction').get(function() {
  return this.transactions.length > 0 ? 
    this.transactions[this.transactions.length - 1] : null;
});

// Virtual to get total transaction count
walletSchema.virtual('transactionCount').get(function() {
  return this.transactions.length;
});

// ✅ OPTIMIZED: Strategic indexes for performance
// Primary index for user wallet lookups
walletSchema.index({ userId: 1 });

// ✅ COMPOUND INDEXES: For common query patterns
walletSchema.index({ userId: 1, updatedAt: -1 }); // User wallets by last update
walletSchema.index({ userId: 1, balance: -1 }); // User wallet balance queries

// ✅ TRANSACTION INDEXES: For efficient transaction queries  
walletSchema.index({ 'transactions.date': -1 }); // Latest transactions first
walletSchema.index({ 'transactions.transactionId': 1 }); // Transaction lookups
walletSchema.index({ 'transactions.orderId': 1 }); // Order-related transactions
walletSchema.index({ 'transactions.returnId': 1 }); // Return-related transactions
walletSchema.index({ 'transactions.type': 1, 'transactions.date': -1 }); // Filter by type + date

// ✅ SPARSE INDEXES: Only index documents that have these fields
walletSchema.index({ 'transactions.orderId': 1 }, { sparse: true });
walletSchema.index({ 'transactions.returnId': 1 }, { sparse: true });

module.exports = mongoose.model('Wallet', walletSchema);
