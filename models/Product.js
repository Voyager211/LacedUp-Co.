const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new mongoose.Schema({
  productName: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  brand: { type: String,  
    required: true 
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  regularPrice: { 
    type: Number, 
    required: true 
  },
  salePrice: { 
    type: Number, 
    required: true 
  },
  productOffer: { 
    type: Number, 
    default: 0
  },
  stock: {
    type: Number, 
    default: 0
  },
  quantity: { 
    type: Number, 
    default: 1 
  },
  features: {
    type: String,
    required: true
  },
  mainImage: { 
    type: String, 
    required: true 
  },
  subImages: [{ 
    type: String 
  }],
  isBlocked: { 
    type: Boolean, 
    default: false 
  },
  status: {
    type: String,
    enum: ["Available", "Not Available"],
    default: "Available"
  },
  isListed: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);