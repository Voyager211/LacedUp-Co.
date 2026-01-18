/**
 * Middleware to check price consistency in development/staging
 */
const priceConsistencyCheck = (req, res, next) => {
  // Only run in development/staging environments
  if (process.env.NODE_ENV === 'production') {
    return next();
  }

  // Hook into response to check prices before sending
  const originalJson = res.json;
  res.json = function(data) {
    // Check if response contains product data
    if (data && (data.products || data.product)) {
      const products = data.products || [data.product];
      
      products.forEach(product => {
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(variant => {
            if (variant.finalPrice && variant.basePrice) {
              // Calculate what the price should be
              const categoryOffer = (product.category && product.category.categoryOffer) || 0;
              const brandOffer = (product.brand && product.brand.brandOffer) || 0;
              const productOffer = product.productOffer || 0;
              const variantOffer = variant.variantSpecificOffer || 0;
              const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
              const expectedPrice = variant.basePrice * (1 - maxOffer / 100);
              
              const priceDifference = Math.abs(variant.finalPrice - expectedPrice);
              
              if (priceDifference > 0.01) {
                console.warn(`⚠️ Price inconsistency detected:`, {
                  product: product.productName,
                  variant: variant.size,
                  stored: variant.finalPrice,
                  expected: expectedPrice,
                  difference: priceDifference
                });
              }
            }
          });
        }
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

module.exports = priceConsistencyCheck;