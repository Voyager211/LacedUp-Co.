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

// Generate unique transaction ID
walletSchema.pre('save', function(next) {
  // Generate transaction IDs for new transactions
  this.transactions.forEach(transaction => {
    if (!transaction.transactionId) {
      transaction.transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }
  });
  next();
});

// Method to add credit to wallet
walletSchema.methods.addCredit = function(amount, description, orderId = null, returnId = null) {
  const newBalance = this.balance + amount;
  
  this.transactions.push({
    type: 'credit',
    amount: amount,
    description: description,
    orderId: orderId,
    returnId: returnId,
    balanceAfter: newBalance,
    status: 'completed'
  });
  
  this.balance = newBalance;
  return this.save();
};

// Method to debit from wallet
walletSchema.methods.debitAmount = function(amount, description, orderId = null) {
  if (this.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }
  
  const newBalance = this.balance - amount;
  
  this.transactions.push({
    type: 'debit',
    amount: amount,
    description: description,
    orderId: orderId,
    balanceAfter: newBalance,
    status: 'completed'
  });
  
  this.balance = newBalance;
  return this.save();
};

// Method to get transaction history with pagination
walletSchema.methods.getTransactionHistory = function(page = 1, limit = 10) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  const sortedTransactions = this.transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(startIndex, endIndex);
  
  return {
    transactions: sortedTransactions,
    totalTransactions: this.transactions.length,
    currentPage: page,
    totalPages: Math.ceil(this.transactions.length / limit),
    hasNextPage: endIndex < this.transactions.length,
    hasPrevPage: page > 1
  };
};

// Static method to get or create wallet for user
walletSchema.statics.getOrCreateWallet = async function(userId) {
  let wallet = await this.findOne({ userId });
  
  if (!wallet) {
    wallet = new this({
      userId: userId,
      balance: 0,
      transactions: []
    });
    await wallet.save();
  }
  
  return wallet;
};

// Static method to transfer money between wallets
walletSchema.statics.transferMoney = async function(fromUserId, toUserId, amount, description) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const fromWallet = await this.getOrCreateWallet(fromUserId);
    const toWallet = await this.getOrCreateWallet(toUserId);
    
    // Debit from sender
    await fromWallet.debitAmount(amount, `Transfer to user: ${description}`, null);
    
    // Credit to receiver
    await toWallet.addCredit(amount, `Transfer from user: ${description}`, null);
    
    await session.commitTransaction();
    return { success: true, message: 'Transfer completed successfully' };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = mongoose.model('Wallet', walletSchema);