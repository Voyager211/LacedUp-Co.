const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [
    {
      productId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Product',
        required: true
      },
      variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
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
        required: true,
        min: 1
      },
      price: {
        type: Number,
        required: true
      },
      totalPrice: {
        type: Number,
        required: true
      },
      status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
        default: 'Pending'
      },
      statusHistory: [
        {
          status: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
            required: true
          },
          updatedAt: {
            type: Date,
            default: Date.now
          },
          notes: {
            type: String
          }
        }
      ],
      cancellationReason: {
        type: String
      },
      returnReason: {
        type: String
      },
      returnRequestDate: {
        type: Date
      },
      cancellationDate: {
        type: Date
      }
    }
  ],
  deliveryAddress: {
    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Address',
      required: true
    },
    addressIndex: {
      type: Number,
      required: true
    }
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'card', 'upi', 'netbanking'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  totalDiscount: {
    type: Number,
    default: 0
  },
  amountAfterDiscount: {
    type: Number,
    required: true
  },
  shipping: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  totalItemCount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Partially Cancelled', 'Returned'],
    default: 'Pending'
  },
  statusHistory: [
    {
      status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Partially Cancelled', 'Returned'],
        required: true
      },
      updatedAt: {
        type: Date,
        default: Date.now
      },
      notes: {
        type: String
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Middleware to sync status with statusHistory before saving
orderSchema.pre('save', function(next) {
  // If statusHistory exists and has entries, sync the status field
  if (this.statusHistory && this.statusHistory.length > 0) {
    this.status = this.statusHistory[this.statusHistory.length - 1].status;
  }
  next();
});

// Method to update order status (recommended way to change status)
orderSchema.methods.updateStatus = function(newStatus, notes = '') {
  // Update the status field
  this.status = newStatus;
  
  // Add entry to statusHistory
  this.statusHistory.push({
    status: newStatus,
    notes: notes,
    updatedAt: new Date()
  });
  
  return this.save();
};

// Method to get current status (redundant but explicit)
orderSchema.methods.getCurrentStatus = function() {
  return this.status;
};

// Method to get status history
orderSchema.methods.getStatusHistory = function() {
  return this.statusHistory.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
};

// Method to calculate order status based on item statuses
orderSchema.methods.calculateOrderStatus = function() {
  const itemStatuses = this.items.map(item => item.status);
  const uniqueStatuses = [...new Set(itemStatuses)];
  
  // If all items are cancelled
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Cancelled') {
    return 'Cancelled';
  }
  
  // If all items are returned
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Returned') {
    return 'Returned';
  }
  
  // If all items are delivered
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Delivered') {
    return 'Delivered';
  }
  
  // If all items are shipped
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Shipped') {
    return 'Shipped';
  }
  
  // If all items are processing
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Processing') {
    return 'Processing';
  }
  
  // If all items are pending
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'Pending') {
    return 'Pending';
  }
  
  // If some items are cancelled but not all
  if (itemStatuses.includes('Cancelled') && !itemStatuses.every(status => status === 'Cancelled')) {
    return 'Partially Cancelled';
  }
  
  // If mixed statuses but no cancellations, use the most advanced status
  const statusPriority = {
    'Pending': 1,
    'Processing': 2,
    'Shipped': 3,
    'Delivered': 4,
    'Returned': 5,
    'Cancelled': 6
  };
  
  const maxPriority = Math.max(...itemStatuses.map(status => statusPriority[status] || 0));
  return Object.keys(statusPriority).find(status => statusPriority[status] === maxPriority);
};

// Method to cancel entire order
orderSchema.methods.cancelOrder = function(reason = '') {
  // Check if order can be cancelled
  if (!['Pending', 'Processing'].includes(this.status)) {
    throw new Error('Order cannot be cancelled in current status');
  }
  
  // Update order status
  this.status = 'Cancelled';
  this.statusHistory.push({
    status: 'Cancelled',
    notes: reason ? `Order cancelled. Reason: ${reason}` : 'Order cancelled',
    updatedAt: new Date()
  });
  
  // Update all items status
  this.items.forEach(item => {
    if (['Pending', 'Processing'].includes(item.status)) {
      item.status = 'Cancelled';
      item.cancellationReason = reason;
      item.cancellationDate = new Date();
      item.statusHistory.push({
        status: 'Cancelled',
        notes: reason ? `Item cancelled. Reason: ${reason}` : 'Item cancelled',
        updatedAt: new Date()
      });
    }
  });
  
  return this.save();
};

// Method to cancel individual item
orderSchema.methods.cancelItem = function(itemId, reason = '') {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error('Item not found');
  }
  
  // Check if item can be cancelled
  if (!['Pending', 'Processing'].includes(item.status)) {
    throw new Error('Item cannot be cancelled in current status');
  }
  
  // Update item status
  item.status = 'Cancelled';
  item.cancellationReason = reason;
  item.cancellationDate = new Date();
  item.statusHistory.push({
    status: 'Cancelled',
    notes: reason ? `Item cancelled. Reason: ${reason}` : 'Item cancelled',
    updatedAt: new Date()
  });
  
  // Recalculate order status based on item statuses
  const newOrderStatus = this.calculateOrderStatus();
  if (newOrderStatus !== this.status) {
    this.status = newOrderStatus;
    this.statusHistory.push({
      status: newOrderStatus,
      notes: newOrderStatus === 'Cancelled' ? 'All items cancelled' : 'Order status updated due to item cancellation',
      updatedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to update individual item status
orderSchema.methods.updateItemStatus = function(itemId, newStatus, notes = '') {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error('Item not found');
  }
  
  // Update item status
  item.status = newStatus;
  item.statusHistory.push({
    status: newStatus,
    notes: notes || `Item status updated to ${newStatus}`,
    updatedAt: new Date()
  });
  
  // Recalculate order status based on item statuses
  const newOrderStatus = this.calculateOrderStatus();
  if (newOrderStatus !== this.status) {
    this.status = newOrderStatus;
    this.statusHistory.push({
      status: newOrderStatus,
      notes: `Order status updated to ${newOrderStatus} due to item status changes`,
      updatedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to return entire order
orderSchema.methods.returnOrder = function(reason = '') {
  // Check if order can be returned
  if (this.status !== 'Delivered') {
    throw new Error('Order can only be returned when delivered');
  }
  
  // Update order status
  this.status = 'Returned';
  this.statusHistory.push({
    status: 'Returned',
    notes: reason ? `Order returned. Reason: ${reason}` : 'Order returned',
    updatedAt: new Date()
  });
  
  // Update all delivered items status
  this.items.forEach(item => {
    if (item.status === 'Delivered') {
      item.status = 'Returned';
      item.returnReason = reason;
      item.returnRequestDate = new Date();
      item.statusHistory.push({
        status: 'Returned',
        notes: reason ? `Item returned. Reason: ${reason}` : 'Item returned',
        updatedAt: new Date()
      });
    }
  });
  
  return this.save();
};

// Method to return individual item
orderSchema.methods.returnItem = function(itemId, reason = '') {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error('Item not found');
  }
  
  // Check if item can be returned
  if (item.status !== 'Delivered') {
    throw new Error('Item can only be returned when delivered');
  }
  
  // Update item status
  item.status = 'Returned';
  item.returnReason = reason;
  item.returnRequestDate = new Date();
  item.statusHistory.push({
    status: 'Returned',
    notes: reason ? `Item returned. Reason: ${reason}` : 'Item returned',
    updatedAt: new Date()
  });
  
  // Recalculate order status
  const newOrderStatus = this.calculateOrderStatus();
  if (newOrderStatus !== this.status) {
    this.status = newOrderStatus;
    this.statusHistory.push({
      status: newOrderStatus,
      notes: 'Order status updated due to item return',
      updatedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['Pending', 'Processing'].includes(this.status);
};

// Method to check if order can be returned
orderSchema.methods.canBeReturned = function() {
  return this.status === 'Delivered';
};

// Method to check if individual item can be cancelled
orderSchema.methods.itemCanBeCancelled = function(itemId) {
  const item = this.items.id(itemId);
  return item && ['Pending', 'Processing'].includes(item.status);
};

// Method to check if individual item can be returned
orderSchema.methods.itemCanBeReturned = function(itemId) {
  const item = this.items.id(itemId);
  return item && item.status === 'Delivered';
};

module.exports = mongoose.model('Order', orderSchema);