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
  },
  finalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  // Keep old field for backward compatibility during migration
  productOffer: {
    type: Number,
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


// Helper method to get final price for a variant (now uses stored finalPrice)
productSchema.methods.calculateVariantFinalPrice = function(variant) {
  // Use stored finalPrice if available, otherwise calculate for backward compatibility
  if (variant.finalPrice !== undefined) {
    return variant.finalPrice;
  }

  // Fallback calculation for migration period
  if (!variant.basePrice) {
    const offer = variant.productOffer || variant.variantSpecificOffer || 0;
    return this.regularPrice * (1 - offer / 100);
  }
  const offer = variant.variantSpecificOffer || 0;
  return variant.basePrice * (1 - offer / 100);
};

// Helper method to get average final price across all variants
productSchema.methods.getAverageFinalPrice = function() {
  if (!this.variants || this.variants.length === 0) {
    return this.regularPrice;
  }

  const totalFinalPrice = this.variants.reduce((total, variant) => {
    return total + (variant.finalPrice || this.calculateVariantFinalPrice(variant));
  }, 0);

  return totalFinalPrice / this.variants.length;
};

// Helper method to get final price for a specific variant by size
productSchema.methods.getVariantFinalPrice = function(size) {
  const variant = this.variants.find(v => v.size === size);
  if (!variant) {
    return this.regularPrice;
  }
  return variant.finalPrice || this.calculateVariantFinalPrice(variant);
};

// Legacy methods for backward compatibility during migration
productSchema.methods.calculateVariantSalePrice = function(variant) {
  return this.calculateVariantFinalPrice(variant);
};

productSchema.methods.getAverageSalePrice = function() {
  return this.getAverageFinalPrice();
};

productSchema.methods.getVariantSalePrice = function(size) {
  return this.getVariantFinalPrice(size);
};

// Auto-generate slug on productName change and calculate total stock from variants
productSchema.pre('save', function (next) {
  // Generate slug if productName is modified
  if (this.isModified('productName')) {
    this.slug = slugify(this.productName, { lower: true, strict: true });
  }

  // Calculate finalPrice for each variant
  if (this.variants && this.variants.length > 0) {
    this.variants.forEach(variant => {
      if (variant.basePrice !== undefined) {
        const offer = variant.variantSpecificOffer || 0;
        variant.finalPrice = variant.basePrice * (1 - offer / 100);
      }
    });

    // Calculate total stock from all variants
    this.totalStock = this.variants.reduce((total, variant) => {
      return total + (variant.stock || 0);
    }, 0);
  } else {
    this.totalStock = 0;
  }

  next();
});

module.exports = mongoose.model('Product', productSchema);