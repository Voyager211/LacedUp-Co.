const mongoose = require('mongoose');

// Import enum arrays from constants
const {
  getOrderStatusArray,
  getPaymentStatusArray,
  getCancellationReasonsArray,
  getReturnReasonsArray,
  getPaymentMethodsArray
} = require('../constants/orderEnums');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  orderDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
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
        enum: getOrderStatusArray(),  
        default: 'Pending'
      },
      paymentStatus: {
        type: String,
        enum: getPaymentStatusArray(), 
        default: 'Pending'
      },
      statusHistory: [
        {
          status: {
            type: String,
            enum: getOrderStatusArray(),  
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
        type: String,
        enum: getCancellationReasonsArray()  
      },
      returnReason: {
        type: String,
        enum: getReturnReasonsArray() 
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
      required: false
    },
    addressIndex: {
      type: Number,
      required: true
    }
  },
  couponApplied: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  couponDiscount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    default: null
  },
  paymentMethod: {
    type: String,
    enum: getPaymentMethodsArray(), 
    required: true
  },
  paymentStatus: {
    type: String,
    enum: getPaymentStatusArray(), 
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
  paypalCaptureId: {
    type: String,
    default: null
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: getOrderStatusArray(), 
  },
  statusHistory: [
    {
      status: {
        type: String,
        enum: getOrderStatusArray(),  
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
    type: String,
    enum: getCancellationReasonsArray()  
  },
  returnReason: {
    type: String,
    enum: getReturnReasonsArray()  
  },
  cancellationDate: {
    type: Date
  },
  returnRequestDate: {
    type: Date
  },
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
  // Sync order status with statusHistory
  if (this.statusHistory && this.statusHistory.length > 0) {
    this.status = this.statusHistory[this.statusHistory.length - 1].status;
  }
  
  // Sync item statuses with their statusHistory
  this.items.forEach(item => {
    if (item.statusHistory && item.statusHistory.length > 0) {
      const latestStatus = item.statusHistory[item.statusHistory.length - 1].status;
      if (item.status !== latestStatus) {
        item.status = latestStatus;
      }
    }
  });
  
  next();
});


orderSchema.pre('save', function(next) {
  // Auto-update timestamps
  this.updatedAt = new Date();
  next();
});




// Simple data getters
orderSchema.methods.getCurrentStatus = function() {
  return this.status;
};


orderSchema.methods.hasItem = function(itemId) {
  return this.items.id(itemId) !== null;
};


module.exports = mongoose.model('Order', orderSchema);
