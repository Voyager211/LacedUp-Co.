const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: {
      type: Schema.Types.ObjectId, // Reference to specific variant
      required: true
    },
    sku: {
      type: String, // Store the variant SKU for easy identification
      required: true
    },
    size: {
      type: String, // Store size for display purposes
      required: true
    },
    quantity: {
      type: Number,
      default: 1
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
      default: 'active'
    },
    cancellationReason: {
      type: String,
      default: 'none'
    }
  }]
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;