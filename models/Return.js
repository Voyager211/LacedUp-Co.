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
      const maxAttempts = 5;
      
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

module.exports = mongoose.model('Return', returnSchema);