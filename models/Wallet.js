const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
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
  transactions: [{
    transactionId: {
      type: String,
      required: true,
      unique: true
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

// Index for better query performance
walletSchema.index({ userId: 1 });
walletSchema.index({ 'transactions.date': -1 });
walletSchema.index({ 'transactions.orderId': 1 });
walletSchema.index({ 'transactions.returnId': 1 });
walletSchema.index({ 'transactions.type': 1 });

module.exports = mongoose.model('Wallet', walletSchema);
