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
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  variantSpecificOffer: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
  // Removed finalPrice field - all calculations are now real-time only
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
  brand: {
    type: Schema.Types.ObjectId,
    ref: "Brand",
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
    default: 0,
    min: 0,
    max: 100
  },
  variants: {
    type: [variantSchema],
    default: []
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

// REAL-TIME PRICE CALCULATION: Always calculate based on current offers
productSchema.methods.calculateVariantFinalPrice = function(variant) {
  const categoryOffer = (this.category && this.category.categoryOffer) || 0;
  const brandOffer = (this.brand && this.brand.brandOffer) || 0;
  const productOffer = this.productOffer || 0;
  const variantOffer = variant.variantSpecificOffer || 0;
  const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
  
  // Fallback for legacy products without basePrice
  if (!variant.basePrice) {
    return this.regularPrice * (1 - maxOffer / 100);
  }
  
  return variant.basePrice * (1 - maxOffer / 100);
};

// REAL-TIME CALCULATION: Get average final price across all variants
productSchema.methods.getAverageFinalPrice = function() {
  if (!this.variants || this.variants.length === 0) {
    return this.regularPrice;
  }

  const totalFinalPrice = this.variants.reduce((total, variant) => {
    return total + this.calculateVariantFinalPrice(variant);
  }, 0);

  return totalFinalPrice / this.variants.length;
};

// REAL-TIME CALCULATION: Get final price for a specific variant by size
productSchema.methods.getVariantFinalPrice = function(size) {
  const variant = this.variants.find(v => v.size === size);
  if (!variant) {
    return this.regularPrice;
  }
  return this.calculateVariantFinalPrice(variant);
};

// Helper method to get the applied offer percentage for a variant
productSchema.methods.getAppliedOffer = function(variant) {
  const categoryOffer = (this.category && this.category.categoryOffer) || 0;
  const brandOffer = (this.brand && this.brand.brandOffer) || 0;
  const productOffer = this.productOffer || 0;
  const variantOffer = variant.variantSpecificOffer || 0;
  return Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
};

// Helper method to determine which offer type is being applied
productSchema.methods.getOfferType = function(variant) {
  const categoryOffer = (this.category && this.category.categoryOffer) || 0;
  const brandOffer = (this.brand && this.brand.brandOffer) || 0;
  const productOffer = this.productOffer || 0;
  const variantOffer = variant.variantSpecificOffer || 0;

  const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);

  if (maxOffer === 0) {
    return 'none';
  } else if (categoryOffer === maxOffer) {
    return 'category';
  } else if (brandOffer === maxOffer) {
    return 'brand';
  } else if (productOffer === maxOffer) {
    return 'product';
  } else {
    return 'variant';
  }
};

// Legacy methods for backward compatibility
productSchema.methods.calculateVariantSalePrice = function(variant) {
  return this.calculateVariantFinalPrice(variant);
};

productSchema.methods.getAverageSalePrice = function() {
  return this.getAverageFinalPrice();
};

productSchema.methods.getVariantSalePrice = function(size) {
  return this.getVariantFinalPrice(size);
};

// Pre-save hook: Only handle slug generation and stock calculation
productSchema.pre('save', async function (next) {
  // Generate slug if productName is modified
  if (this.isModified('productName')) {
    this.slug = slugify(this.productName, { lower: true, strict: true });
  }

  // Validate that all variant base prices are less than regular price
  if (this.variants && this.variants.length > 0 && this.regularPrice) {
    const regularPrice = parseFloat(this.regularPrice);
    if (regularPrice > 0) {
      for (let i = 0; i < this.variants.length; i++) {
        const variant = this.variants[i];
        if (variant.basePrice && variant.basePrice >= regularPrice) {
          const error = new Error(`Variant ${i + 1} (${variant.size}): Base price (₹${Math.round(variant.basePrice)}) must be less than regular price (₹${Math.round(regularPrice)})`);
          error.name = 'ValidationError';
          return next(error);
        }
      }
    }
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