const mongoose = require('mongoose');
const slugify = require('slugify');
const Schema = mongoose.Schema;

const productSchema = new mongoose.Schema({
  productName: { 
    type: String, 
    required: true 
  },
  slug: {
    type: String,
    unique: true
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
  sold: {
    type: Number,
    default: 0
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
  status: {
    type: String,
    enum: ["Available", "Not Available"],
    default: "Available"
  },
  isListed: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });


// Auto-generate slug on productName change
productSchema.pre('save', function (next) {
  if (this.isModified('productName')) {
    this.slug = slugify(this.productName, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);