const mongoose = require('mongoose');
const slugify = require('slugify');
const Schema = mongoose.Schema;

// Variant sub-schema for product sizes
const variantSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true
  },
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  productOffer: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100
  }
}, { _id: true });

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
  productOffer: {
    type: Number,
    default: 0
  },
  variants: {
    type: [variantSchema],
    default: [
      { size: "UK 6", stock: 10, productOffer: 0 },
      { size: "UK 7", stock: 15, productOffer: 0 },
      { size: "UK 8", stock: 20, productOffer: 0 },
      { size: "UK 9", stock: 12, productOffer: 0 },
      { size: "UK 10", stock: 8, productOffer: 0 }
    ]
  },
  totalStock: {
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


// Helper method to calculate sale price for a variant
productSchema.methods.calculateVariantSalePrice = function(variant) {
  const offer = variant.productOffer || 0;
  return this.regularPrice * (1 - offer / 100);
};

// Helper method to get average sale price across all variants
productSchema.methods.getAverageSalePrice = function() {
  if (!this.variants || this.variants.length === 0) {
    return this.regularPrice;
  }

  const totalSalePrice = this.variants.reduce((total, variant) => {
    return total + this.calculateVariantSalePrice(variant);
  }, 0);

  return totalSalePrice / this.variants.length;
};

// Helper method to get sale price for a specific variant by size
productSchema.methods.getVariantSalePrice = function(size) {
  const variant = this.variants.find(v => v.size === size);
  if (!variant) {
    return this.regularPrice;
  }
  return this.calculateVariantSalePrice(variant);
};

// Auto-generate slug on productName change and calculate total stock from variants
productSchema.pre('save', function (next) {
  // Generate slug if productName is modified
  if (this.isModified('productName')) {
    this.slug = slugify(this.productName, { lower: true, strict: true });
  }

  // Calculate total stock from all variants
  if (this.variants && this.variants.length > 0) {
    this.totalStock = this.variants.reduce((total, variant) => {
      return total + (variant.stock || 0);
    }, 0);
  } else {
    this.totalStock = 0;
  }

  next();
});

module.exports = mongoose.model('Product', productSchema);