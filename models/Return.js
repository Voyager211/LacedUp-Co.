const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema({
  returnId: {
    type: String,
    unique: true
  },
  orderId: {
    type: String,
    required: true,
    ref: 'Order'
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  productImage: {
    type: String
  },
  sku: {
    type: String,
    required: true
  },
  size: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processing', 'Completed'],
    default: 'Pending'
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  processedDate: {
    type: Date
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: {
    type: String
  },
  refundAmount: {
    type: Number
  },
  refundMethod: {
    type: String,
    enum: ['Original Payment Method', 'Wallet', 'Bank Transfer'],
    default: 'Original Payment Method'
  },
  refundStatus: {
    type: String,
    enum: ['Pending', 'Processed', 'Failed'],
    default: 'Pending'
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true
});

// Generate unique return ID
returnSchema.pre('save', async function(next) {
  if (!this.returnId) {
    try {
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!isUnique && attempts < maxAttempts) {
        const count = await mongoose.model('Return').countDocuments();
        const newReturnId = `RET${String(count + 1 + attempts).padStart(6, '0')}`;
        
        // Check if this ID already exists
        const existingReturn = await mongoose.model('Return').findOne({ returnId: newReturnId });
        
        if (!existingReturn) {
          this.returnId = newReturnId;
          isUnique = true;
        } else {
          attempts++;
        }
      }
      
      if (!isUnique) {
        // Fallback to timestamp-based ID
        this.returnId = `RET${Date.now()}`;
      }
    } catch (error) {
      console.error('Error generating return ID:', error);
      // Fallback to timestamp-based ID
      this.returnId = `RET${Date.now()}`;
    }
  }
  next();
});

// Method to update return status
returnSchema.methods.updateStatus = function(status, notes = '', updatedBy = null) {
  this.status = status;
  this.statusHistory.push({
    status,
    notes,
    updatedBy,
    updatedAt: new Date()
  });
  
  if (status === 'Approved' || status === 'Rejected' || status === 'Completed') {
    this.processedDate = new Date();
    this.processedBy = updatedBy;
  }
  
  return this.save();
};

// Method to approve return
returnSchema.methods.approve = function(adminNotes = '', refundAmount = null, updatedBy = null) {
  this.status = 'Approved';
  this.adminNotes = adminNotes;
  this.refundAmount = refundAmount || this.totalPrice;
  this.processedDate = new Date();
  this.processedBy = updatedBy;
  
  this.statusHistory.push({
    status: 'Approved',
    notes: adminNotes || 'Return request approved',
    updatedBy,
    updatedAt: new Date()
  });
  
  return this.save();
};

// Method to reject return
returnSchema.methods.reject = function(adminNotes = '', updatedBy = null) {
  this.status = 'Rejected';
  this.adminNotes = adminNotes;
  this.processedDate = new Date();
  this.processedBy = updatedBy;
  
  this.statusHistory.push({
    status: 'Rejected',
    notes: adminNotes || 'Return request rejected',
    updatedBy,
    updatedAt: new Date()
  });
  
  return this.save();
};

// Method to process refund
returnSchema.methods.processRefund = function(refundMethod = 'Original Payment Method', updatedBy = null) {
  this.refundStatus = 'Processed';
  this.refundMethod = refundMethod;
  
  this.statusHistory.push({
    status: 'Refund Processed',
    notes: `Refund of ₹${this.refundAmount} processed via ${refundMethod}`,
    updatedBy,
    updatedAt: new Date()
  });
  
  return this.save();
};

module.exports = mongoose.model('Return', returnSchema);