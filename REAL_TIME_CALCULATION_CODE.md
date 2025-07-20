# Real-Time Price Calculation Code

## 🎯 Core Calculation Method (Product Model)

**File:** `models/Product.js`

```javascript
// REAL-TIME PRICE CALCULATION: Always calculate based on current offers
productSchema.methods.calculateVariantFinalPrice = function(variant) {
  // 🔍 Get all possible offers
  const categoryOffer = (this.category && this.category.categoryOffer) || 0;
  const brandOffer = (this.brand && this.brand.brandOffer) || 0;
  const productOffer = this.productOffer || 0;
  const variantOffer = variant.variantSpecificOffer || 0;
  
  // 🏆 Take the MAXIMUM offer (best deal for customer)
  const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
  
  // 💰 Calculate final price: basePrice - (basePrice * offer%)
  // Fallback for legacy products without basePrice
  if (!variant.basePrice) {
    return this.regularPrice * (1 - maxOffer / 100);
  }
  
  return variant.basePrice * (1 - maxOffer / 100);
};
```

## 🧮 Average Price Calculation

```javascript
// REAL-TIME CALCULATION: Get average final price across all variants
productSchema.methods.getAverageFinalPrice = function() {
  if (!this.variants || this.variants.length === 0) {
    return this.regularPrice;
  }

  // 🔄 Calculate each variant's price in real-time and average them
  const totalFinalPrice = this.variants.reduce((total, variant) => {
    return total + this.calculateVariantFinalPrice(variant); // ← Real-time call
  }, 0);

  return totalFinalPrice / this.variants.length;
};
```

## 🎯 Specific Variant Price

```javascript
// REAL-TIME CALCULATION: Get final price for a specific variant by size
productSchema.methods.getVariantFinalPrice = function(size) {
  const variant = this.variants.find(v => v.size === size);
  if (!variant) {
    return this.regularPrice;
  }
  return this.calculateVariantFinalPrice(variant); // ← Real-time call
};
```

## 🌐 Controller Usage

**File:** `controllers/user/product-controller.js`

```javascript
// In getProducts method:
const productsWithRatings = await Promise.all(
  products.map(async (product) => {
    // ... other code ...
    
    const productObj = product.toObject();

    if (productObj.variants && productObj.variants.length > 0) {
      // 🔄 REAL-TIME: Calculate average final price
      productObj.averageFinalPrice = product.getAverageFinalPrice();
      // Keep backward compatibility
      productObj.averageSalePrice = productObj.averageFinalPrice;
    } else {
      productObj.averageFinalPrice = productObj.regularPrice;
      productObj.averageSalePrice = productObj.regularPrice;
    }

    return { ...productObj, averageRating: avgRating, totalReviews };
  })
);
```

## 🎨 Frontend Display

**File:** `views/user/partials/product-card.ejs`

```html
<%
  // Use backend-calculated averageFinalPrice (now always real-time calculated)
  let avgPrice;
  if (typeof product.averageFinalPrice !== 'undefined') {
    avgPrice = product.averageFinalPrice; // ← From real-time backend calculation
  } else {
    // Fallback: calculate real-time price using current offers
    const finalPrices = product.variants.map(v => {
      const basePrice = v.basePrice || product.regularPrice;
      const categoryOffer = (product.category && product.category.categoryOffer) || 0;
      const brandOffer = (product.brand && product.brand.brandOffer) || 0;
      const productOffer = product.productOffer || 0;
      const variantOffer = v.variantSpecificOffer || 0;
      const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
      return basePrice * (1 - maxOffer / 100); // ← Same formula as backend
    });
    avgPrice = finalPrices.reduce((sum, price) => sum + price, 0) / finalPrices.length;
  }
%>

<!-- Display the calculated price -->
<p class="mb-0 fw-semibold text-danger">₹<%= Math.round(avgPrice) %></p>
```

## 🔍 Key Changes Made

### ❌ Before (Cached/Stale):
```javascript
// OLD: Used cached finalPrice (could be stale)
productSchema.methods.calculateVariantFinalPrice = function(variant) {
  if (variant.finalPrice !== undefined) {
    return variant.finalPrice; // ← PROBLEM: Returned old cached value
  }
  // ... calculation only if cached value missing
};
```

### ✅ After (Real-time):
```javascript
// NEW: Always calculate in real-time
productSchema.methods.calculateVariantFinalPrice = function(variant) {
  // Always get current offers and calculate fresh
  const categoryOffer = (this.category && this.category.categoryOffer) || 0;
  const brandOffer = (this.brand && this.brand.brandOffer) || 0;
  const productOffer = this.productOffer || 0;
  const variantOffer = variant.variantSpecificOffer || 0;
  const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
  
  return variant.basePrice * (1 - maxOffer / 100); // ← Always fresh calculation
};
```

## 🧪 Example Calculation

For **Under Armour Phantom 4 Chrome UK7**:

```javascript
// Input values:
variant.basePrice = 14999
categoryOffer = 0    // Gym Sneakers category
brandOffer = 0       // Under Armour brand  
productOffer = 0     // Product specific
variantOffer = 0     // UK7 variant specific

// Calculation:
maxOffer = Math.max(0, 0, 0, 0) = 0
finalPrice = 14999 * (1 - 0/100) = 14999 * 1 = 14999

// Result: ₹14,999 ✅
```

## 🚀 Benefits

1. **🔄 Real-time Updates**: Prices change immediately when offers are modified
2. **🎯 Accuracy**: No stale cached data
3. **🔍 Transparency**: Single source of truth for price calculation
4. **🛡️ Consistency**: Same calculation logic everywhere
5. **🧹 Simplicity**: No cache invalidation complexity