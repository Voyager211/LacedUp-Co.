// Helper functions for comprehensive cart validation

/**
 * Validates if a product is available for purchase
 * @param {Object} product - Product object with populated category and brand
 * @returns {Object} - { isValid: boolean, reason: string }
 */
const validateProductAvailability = (product) => {
  // Check product availability
  if (!product || !product.isListed || product.isDeleted) {
    return { isValid: false, reason: 'Product is no longer available' };
  }

  // Check category availability
  if (product.category && 
      (product.category.isListed === false || 
       product.category.isDeleted === true || 
       product.category.isActive === false)) {
    return { isValid: false, reason: 'Product category is no longer available' };
  }

  // Check brand availability
  if (product.brand && 
      (product.brand.isActive === false || 
       product.brand.isDeleted === true)) {
    return { isValid: false, reason: 'Product brand is no longer available' };
  }

  return { isValid: true, reason: null };
};

/**
 * Validates if a cart item is available for purchase
 * @param {Object} item - Cart item with populated product data
 * @returns {Object} - { isValid: boolean, reason: string, details: Object }
 */
const validateCartItem = (item) => {
  const productValidation = validateProductAvailability(item.productId);
  
  if (!productValidation.isValid) {
    return {
      isValid: false,
      reason: productValidation.reason,
      details: {
        productName: item.productId ? item.productId.productName : 'Unknown Product',
        size: item.size,
        quantity: item.quantity
      }
    };
  }

  // Check variant availability if applicable
  if (item.variantId) {
    const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
    
    if (!variant) {
      return {
        isValid: false,
        reason: 'Product variant is no longer available',
        details: {
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity
        }
      };
    }

    // Check variant stock
    if (variant.stock === 0) {
      return {
        isValid: false,
        reason: `Size ${item.size} is currently out of stock`,
        details: {
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          availableStock: 0
        }
      };
    }

    // Check if cart quantity exceeds available stock
    if (item.quantity > variant.stock) {
      return {
        isValid: false,
        reason: `Only ${variant.stock} items available in stock for size ${item.size}. You have ${item.quantity} in your cart.`,
        details: {
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          availableStock: variant.stock
        }
      };
    }
  }

  return { isValid: true, reason: null, details: null };
};

/**
 * Standard populate query for cart items with comprehensive data
 */
const getCartPopulateQuery = () => {
  return {
    path: 'items.productId',
    populate: [
      {
        path: 'category',
        select: 'name isListed isDeleted isActive categoryOffer'
      },
      {
        path: 'brand',
        select: 'name isActive isDeleted brandOffer'
      }
    ]
  };
};

module.exports = {
  validateProductAvailability,
  validateCartItem,
  getCartPopulateQuery
};