const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Wishlist = require('../../models/Wishlist');
const walletService = require('../../services/paymentProviders/walletService');

// Helper function to calculate final price with offers
const calculateFinalPrice = async (product) => {
  // Populate brand and category if not already populated
  if (!product.brand || !product.category) {
    await product.populate(['brand', 'category']);
  }
  
  // Get the average final price from the product model if method exists
  if (typeof product.getAverageFinalPrice === 'function') {
    return product.getAverageFinalPrice();
  }
  
  // Fallback to regular price
  return product.regularPrice || 0;
};

// Helper function to calculate variant-specific final price
const calculateVariantFinalPrice = (product, variant) => {
  try {
    if (typeof product.calculateVariantFinalPrice === 'function') {
      return product.calculateVariantFinalPrice(variant);
    }
    
    // Fallback to variant base price or product regular price
    return variant.basePrice || product.regularPrice || 0;
  } catch (error) {
    console.error('Error calculating variant price:', error);
    return variant.basePrice || product.regularPrice || 0;
  }
};

// Helper function to calculate item total
const calculateItemTotal = (price, quantity) => {
  return price * quantity;
};

// Add product to cart with comprehensive validation (SKU-based)
const addToCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { productId, variantId, quantity = 1 } = req.body;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: 'Variant ID is required. Please select a size.'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity! Please select between 1 and 5 items per product.'
      });
    }

    // Get product with category and brand for price calculation
    let product;
    try {
      product = await Product.findById(productId).populate(['category', 'brand']);
    } catch (dbError) {
      console.error('Database error fetching product:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while fetching product'
      });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Enhanced product availability validation
    if (!product.isListed || product.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product is no longer available for purchase',
        code: 'PRODUCT_UNAVAILABLE'
      });
    }

    // Enhanced category availability validation
    if (product.category && (product.category.isListed === false || product.category.isDeleted === true)) {
      return res.status(403).json({
        success: false,
        message: 'This product category is no longer available',
        code: 'CATEGORY_UNAVAILABLE'
      });
    }

    // Enhanced brand availability validation
    if (product.brand && (product.brand.isActive === false || product.brand.isDeleted === true)) {
      return res.status(403).json({
        success: false,
        message: 'This product brand is no longer available',
        code: 'BRAND_UNAVAILABLE'
      });
    }

    // Find the specific variant
    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    // Check variant stock availability
    if (variant.stock === 0) {
      return res.status(403).json({
        success: false,
        message: `Size ${variant.size} is currently out of stock`,
        code: 'OUT_OF_STOCK'
      });
    }

    if (variant.stock < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${variant.stock} items available in stock for size ${variant.size}`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    // Find or create user's cart
    let cart;
    try {
      cart = await Cart.findOne({ userId });
      if (!cart) {
        cart = new Cart({
          userId,
          items: []
        });
      }
    } catch (dbError) {
      console.error('Database error with cart:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while accessing cart'
      });
    }

    // Check if this specific variant already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    // Calculate final price with enhanced price calculation
    const finalPrice = calculateVariantFinalPrice(product, variant);

    if (existingItemIndex > -1) {
      // Update existing item
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = existingItem.quantity + parsedQuantity;

      if (newQuantity > variant.stock) {
        return res.status(403).json({
          success: false,
          message: `Cannot add more items. Only ${variant.stock} available in stock for size ${variant.size}. You already have ${existingItem.quantity} in your cart.`,
          code: 'CART_STOCK_LIMIT'
        });
      }

      if (newQuantity > 5) {
        return res.status(403).json({
          success: false,
          message: `Maximum limit reached! You can only add up to 5 items per variant. You currently have ${existingItem.quantity} in your cart.`,
          code: 'CART_QUANTITY_LIMIT'
        });
      }
      
      existingItem.quantity = newQuantity;
      existingItem.price = finalPrice;
      existingItem.totalPrice = calculateItemTotal(finalPrice, newQuantity);
    } else {
      // Add new item with variant information
      cart.items.push({
        productId,
        variantId,
        sku: variant.sku,
        size: variant.size,
        quantity: parsedQuantity,
        price: finalPrice,
        totalPrice: calculateItemTotal(finalPrice, parsedQuantity)
      });
    }

    try {
      await cart.save();
    } catch (saveError) {
      console.error('Error saving cart:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save cart'
      });
    }

    // Remove from wishlist if present
    try {
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist) {
        const originalLength = wishlist.products.length;
        wishlist.products = wishlist.products.filter(item => 
          item.productId.toString() !== productId
        );

        // Only save if items were actually removed
        if (wishlist.products.length !== originalLength) {
          await wishlist.save();
        }
      }
    } catch (wishlistError) {
      console.error('Error removing from wishlist: ', wishlistError);
    }

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: `Product (Size: ${variant.size}) added to cart successfully`,
      cartCount,
      wishlistCount: 0
    });

  } catch (error) {
    console.error('Unexpected error in addToCart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart'
    });
  }
};

// Get cart count for navbar
const getCartCount = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.json({ count: 0 });
    }

    const cart = await Cart.findOne({ userId });
    // Count number of items (not quantities) - same logic as cart page title
    const count = cart ? cart.items.length : 0;

    res.json({ count });

  } catch (error) {
    console.error('Error getting cart count:', error);
    res.json({ count: 0 });
  }
};

// Load cart page (SKU-based) - UPDATED VERSION
const loadCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isListed isDeleted categoryOffer'
          },
          {
            path: 'brand',
            select: 'name brandOffer isActive isDeleted'
          }
        ]
      });

    let availableCartItems = [];
    let outOfStockCartItems = [];
    let unavailableCartItems = [];
    let itemsToRemove = [];
    let priceUpdatesNeeded = false;
    
    if (cart && cart.items) {
      // Process each cart item and categorize them
      for (let i = 0; i < cart.items.length; i++) {
        const item = cart.items[i];
        
        // Check if product exists
        if (!item.productId) {
          itemsToRemove.push(i);
          continue;
        }

        // Check if variant exists in the product (for SKU-based items)
        if (item.variantId) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (!variant) {
            // console.log(`Variant ${item.variantId} not found for product ${item.productId._id}`);
            itemsToRemove.push(i);
            continue;
          }

          const itemObj = item.toObject();
          
          // Calculate the current price for this variant
          const currentPrice = calculateVariantFinalPrice(item.productId, variant);
          
          // Check if price needs updating
          if (Math.abs(item.price - currentPrice) > 0.01) {
            priceUpdatesNeeded = true;
            // Update the price in the cart item object for display
            itemObj.price = currentPrice;
            itemObj.totalPrice = currentPrice * item.quantity;
          }
          
          // Add sale price to the product object for compatibility
          try {
            itemObj.productId.salePrice = typeof item.productId.getAverageFinalPrice === 'function' 
              ? item.productId.getAverageFinalPrice() 
              : item.productId.regularPrice;
          } catch (error) {
            itemObj.productId.salePrice = item.productId.regularPrice;
          }

          // Check product, category, and brand availability
          const isProductUnavailable = !item.productId.isListed || item.productId.isDeleted;
          const isCategoryUnavailable = item.productId.category && 
            (item.productId.category.isListed === false || item.productId.category.isDeleted === true);
          const isBrandUnavailable = item.productId.brand && 
            (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true);

          // Categorize based on availability and stock
          if (isProductUnavailable || isCategoryUnavailable || isBrandUnavailable) {
            // Product, category, or brand is blocked/unlisted - show as unavailable
            itemObj.isUnavailable = true;
            if (isProductUnavailable) {
              itemObj.unavailableReason = 'Product unavailable';
            } else if (isCategoryUnavailable) {
              itemObj.unavailableReason = 'Category unavailable';
            } else if (isBrandUnavailable) {
              itemObj.unavailableReason = 'Brand unavailable';
            }
            unavailableCartItems.push(itemObj);
          } else if (variant.stock === 0) {
            // Out of stock - add to separate array
            outOfStockCartItems.push(itemObj);
          } else {
            // Available - add to main cart items
            availableCartItems.push(itemObj);
          }
        } else {
          // Handle items without variants (legacy support)
          const itemObj = item.toObject();
          
          // Add sale price to the product object for compatibility
          try {
            itemObj.productId.salePrice = typeof item.productId.getAverageFinalPrice === 'function' 
              ? item.productId.getAverageFinalPrice() 
              : item.productId.regularPrice;
          } catch (error) {
            itemObj.productId.salePrice = item.productId.regularPrice;
          }

          // Check product and category availability
          const isProductUnavailable = !item.productId.isListed || item.productId.isDeleted;
          const isCategoryUnavailable = item.productId.category && 
            (item.productId.category.isListed === false || item.productId.category.isDeleted === true);

          if (isProductUnavailable || isCategoryUnavailable) {
            // Product or category is blocked/unlisted - show as unavailable
            itemObj.isUnavailable = true;
            itemObj.unavailableReason = isProductUnavailable ? 'Product unavailable' : 'Category unavailable';
            unavailableCartItems.push(itemObj);
          } else {
            availableCartItems.push(itemObj);
          }
        }
      }

      // Remove items that are completely unavailable (product deleted from database)
      if (itemsToRemove.length > 0) {
        // Remove items in reverse order to maintain indices
        for (let i = itemsToRemove.length - 1; i >= 0; i--) {
          cart.items.splice(itemsToRemove[i], 1);
        }
        priceUpdatesNeeded = true;
      }

      // If prices need updating, save the cart with updated prices
      if (priceUpdatesNeeded) {
        try {
          for (let i = 0; i < cart.items.length; i++) {
            const cartItem = cart.items[i];
            if (cartItem.variantId) {
              const product = await Product.findById(cartItem.productId).populate(['category', 'brand']);
              if (product) {
                const variant = product.variants.find(v => v._id.toString() === cartItem.variantId.toString());
                if (variant) {
                  const currentPrice = calculateVariantFinalPrice(product, variant);
                  cartItem.price = currentPrice;
                  cartItem.totalPrice = currentPrice * cartItem.quantity;
                }
              }
            }
          }
          await cart.save();
          // console.log('Cart prices updated successfully');
        } catch (updateError) {
          console.error('Error updating cart prices:', updateError);
        }
      }
    }

    // Ensure all items have proper status flags before combining
    availableCartItems.forEach(item => {
      item.isUnavailable = false;
      item.isOutOfStock = false;
    });

    outOfStockCartItems.forEach(item => {
      item.isUnavailable = false;
      item.isOutOfStock = true;
    });

    unavailableCartItems.forEach(item => {
      item.isUnavailable = true;
      item.isOutOfStock = false;
    });

    // Combine all cart items for display (available items first, then out of stock, then unavailable)
    const allCartItems = [...availableCartItems, ...outOfStockCartItems, ...unavailableCartItems];

    res.render('user/cart', {
      user,
      cartItems: allCartItems,
      availableCartItems,
      outOfStockCartItems,
      unavailableCartItems,
      title: 'My Cart',
      layout: 'user/layouts/user-layout',
      active: 'cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.status(500).render('error', { message: 'Error loading cart' });
  }
};

// Remove item from cart (SKU-based)
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { productId, variantId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove the specific item from cart
    const initialLength = cart.items.length;
    
    if (variantId) {
      // Remove specific variant
      cart.items = cart.items.filter(
        item => !(item.productId.toString() === productId && item.variantId.toString() === variantId)
      );
    } else {
      // Remove all variants of the product (backward compatibility)
      cart.items = cart.items.filter(
        item => item.productId.toString() !== productId
      );
    }

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: 'Product removed from cart successfully',
      cartCount
    });

  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from cart'
    });
  }
};

// Update cart item quantity (SKU-based)
const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { productId, variantId, quantity } = req.body;

    // Validate input
    if (!productId || !variantId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, variant ID, and quantity are required'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity! Please select between 1 and 5 items per variant.'
      });
    }

    // Get product with category and brand for price calculation
    const product = await Product.findById(productId).populate(['category', 'brand']);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check product, category, and brand availability
    if (!product.isListed || product.isDeleted ||
        (product.category && (product.category.isListed === false || product.category.isDeleted === true)) ||
        (product.brand && (product.brand.isActive === false || product.brand.isDeleted === true))) {
      return res.status(403).json({
        success: false,
        message: 'Product is no longer available'
      });
    }

    // Find the specific variant
    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the specific item in cart (by productId and variantId)
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found in cart'
      });
    }

    const currentQuantity = cart.items[itemIndex].quantity;

    // Enhanced stock validation - only check when increasing quantity
    if (variant.stock === 0) {
      return res.status(403).json({
        success: false,
        message: `Size ${variant.size} is currently out of stock`,
        code: 'OUT_OF_STOCK',
        availableStock: 0
      });
    }

    // Only validate stock limits when increasing quantity
    if (parsedQuantity > currentQuantity && variant.stock < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${variant.stock} items available in stock for size ${variant.size}. Cannot increase to ${parsedQuantity} items.`,
        code: 'INSUFFICIENT_STOCK',
        availableStock: variant.stock,
        requestedQuantity: parsedQuantity,
        currentQuantity: currentQuantity
      });
    }

    // Calculate final price with enhanced price calculation
    const finalPrice = calculateVariantFinalPrice(product, variant);
    
    // Update quantity and total price
    cart.items[itemIndex].quantity = parsedQuantity;
    cart.items[itemIndex].price = finalPrice;
    cart.items[itemIndex].totalPrice = calculateItemTotal(finalPrice, parsedQuantity);

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    // ✅ Calculate updated cart summary
    let totalItemCount = 0;
    let subtotal = 0;
    let totalDiscount = 0;
    let availableItemsCount = 0;
    let availableQuantity = 0;

    // Calculate totals from all cart items
    for (const cartItem of cart.items) {
      totalItemCount += cartItem.quantity;
      
      // Get product for price calculation
      const itemProduct = await Product.findById(cartItem.productId).populate(['category', 'brand']);
      if (itemProduct) {
        const regularPrice = itemProduct.regularPrice || cartItem.price;
        subtotal += regularPrice * cartItem.quantity;
        
        // Calculate discount (regular price - sale price)
        const itemDiscount = (regularPrice - cartItem.price) * cartItem.quantity;
        totalDiscount += Math.max(0, itemDiscount);
        
        // Count available items (not out of stock)
        if (cartItem.variantId) {
          const itemVariant = itemProduct.variants.find(v => v._id.toString() === cartItem.variantId.toString());
          if (itemVariant && itemVariant.stock > 0) {
            availableItemsCount++;
            availableQuantity += cartItem.quantity;
          }
        } else {
          availableItemsCount++;
          availableQuantity += cartItem.quantity;
        }
      }
    }

    const shipping = subtotal > 500 ? 0 : 50;
    const total = subtotal - totalDiscount + shipping;

    const updatedCartSummary = {
      totalItemCount,
      subtotal: Math.round(subtotal),
      totalDiscount: Math.round(totalDiscount),
      shipping,
      total: Math.round(total),
      availableItemsCount,
      availableQuantity
    };

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cartCount,
      itemTotal: cart.items[itemIndex].totalPrice,
      cartSummary: updatedCartSummary  // ✅ Add cart summary
    });

  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};


// Clear entire cart
const clearCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Find and clear user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cartCount: 0
    });

  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};

// Remove all out-of-stock items from cart (SKU-based)
const removeOutOfStockItems = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Filter out items that are out of stock or unavailable (variant-specific)
    const initialItemCount = cart.items.length;
    const availableItems = cart.items.filter(item => {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        return false; // Remove this item
      }

      // Enhanced category check
      if (item.productId.category && 
          (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
        return false; // Remove this item
      }

      // Enhanced brand check
      if (item.productId.brand && 
          (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
        return false; // Remove this item
      }

      // Check variant-specific stock
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant || variant.stock === 0) {
          return false; // Remove this item
        }
      }

      return true; // Keep this item
    });

    const removedItemCount = initialItemCount - availableItems.length;

    if (removedItemCount === 0) {
      return res.json({
        success: true,
        message: 'No out-of-stock items found to remove',
        removedCount: 0,
        cartCount: cart.items.reduce((total, item) => total + item.quantity, 0)
      });
    }

    // Update cart with only available items
    cart.items = availableItems;
    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: `Successfully removed ${removedItemCount} out-of-stock item${removedItemCount > 1 ? 's' : ''} from cart`,
      removedCount: removedItemCount,
      cartCount
    });

  } catch (error) {
    console.error('Error removing out-of-stock items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove out-of-stock items'
    });
  }
};

// Validate cart items and return availability status (SKU-based)
const validateCartItems = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart) {
      return res.json({
        success: true,
        availableItems: [],
        outOfStockItems: [],
        totalItems: 0
      });
    }

    const availableItems = [];
    const outOfStockItems = [];

    cart.items.forEach(item => {
      const itemData = {
        productId: item.productId._id,
        variantId: item.variantId,
        productName: item.productId.productName,
        size: item.size,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      };

      // Check availability (variant-specific)
      let isAvailable = true;
      let reason = '';

      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        isAvailable = false;
        reason = 'Product unavailable';
      } else if (item.productId.category && 
                 (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
        isAvailable = false;
        reason = 'Category unavailable';
      } else if (item.productId.brand && 
                 (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
        isAvailable = false;
        reason = 'Brand unavailable';
      } else if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          isAvailable = false;
          reason = 'Variant not found';
        } else if (variant.stock === 0) {
          isAvailable = false;
          reason = `Size ${item.size} - Out of stock`;
        } else {
          itemData.stock = variant.stock;
        }
      }

      if (isAvailable) {
        availableItems.push(itemData);
      } else {
        outOfStockItems.push({
          ...itemData,
          reason
        });
      }
    });

    res.json({
      success: true,
      availableItems,
      outOfStockItems,
      totalItems: cart.items.length,
      availableCount: availableItems.length,
      outOfStockCount: outOfStockItems.length
    });

  } catch (error) {
    console.error('Error validating cart items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cart items'
    });
  }
};

// Check authentication status
const checkAuth = async (req, res) => {
  try {
    const isAuthenticated = !!(req.user || req.session.userId);
    res.json({ 
      authenticated: isAuthenticated,
      user: isAuthenticated ? (req.user || { id: req.session.userId }) : null
    });
  } catch (error) {
    console.error('Error checking authentication:', error);
    res.json({ authenticated: false, user: null });
  }
};

// Load checkout page
const loadCheckout = async (req, res) => {
  return res.redirect('/checkout');
};

// Validate cart stock for checkout
const validateCheckoutStock = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isListed isDeleted categoryOffer'
          },
          {
            path: 'brand',
            select: 'name brandOffer isActive isDeleted'
          }
        ]
      });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    const validationResults = {
      validItems: [],
      invalidItems: [],
      outOfStockItems: [],
      unavailableItems: []
    };

    // Only consider items that would actually be included in checkout
    // Out-of-stock items are excluded from checkout (like on cart page)
    let checkoutEligibleItems = [];

    for (const item of cart.items) {
      const itemData = {
        productId: item.productId._id,
        variantId: item.variantId,
        productName: item.productId.productName,
        size: item.size,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      };

      // Check if product exists and is available
      if (!item.productId || !item.productId.isListed || item.productId.isDeleted) {
        validationResults.unavailableItems.push({
          ...itemData,
          reason: 'Product is no longer available'
        });
        continue; // Skip this item - it won't be in checkout
      }

      // Check category availability
      if (item.productId.category && 
          (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
        validationResults.unavailableItems.push({
          ...itemData,
          reason: 'Product category is no longer available'
        });
        continue; // Skip this item - it won't be in checkout
      }

      // Check brand availability
      if (item.productId.brand && 
          (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
        validationResults.unavailableItems.push({
          ...itemData,
          reason: 'Product brand is no longer available'
        });
        continue; // Skip this item - it won't be in checkout
      }

      // Check variant-specific stock
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        
        if (!variant) {
          validationResults.invalidItems.push({
            ...itemData,
            reason: 'Product variant not found'
          });
          continue; // Skip this item - it won't be in checkout
        }

        if (variant.stock === 0) {
          validationResults.outOfStockItems.push({
            ...itemData,
            reason: `Size ${item.size} is out of stock`,
            availableStock: 0
          });
          continue; // Skip this item - it won't be in checkout (excluded like on cart page)
        }

        if (variant.stock < item.quantity) {
          validationResults.outOfStockItems.push({
            ...itemData,
            reason: `Only ${variant.stock} items available for size ${item.size}`,
            availableStock: variant.stock,
            requestedQuantity: item.quantity
          });
          continue; // Skip this item - it won't be in checkout
        }

        // Item is valid and will be included in checkout
        validationResults.validItems.push({
          ...itemData,
          availableStock: variant.stock
        });
        checkoutEligibleItems.push(item);
      } else {
        // Handle items without variants (legacy support)
        validationResults.validItems.push(itemData);
        checkoutEligibleItems.push(item);
      }
    }

    // Check if there are any items eligible for checkout
    if (checkoutEligibleItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in your cart are available for checkout. Please add available items to your cart.',
        code: 'NO_CHECKOUT_ITEMS',
        validationResults
      });
    }

    // If there are checkout-eligible items, validation passes
    // Out-of-stock items are simply excluded from checkout (not an error)
    res.json({
      success: true,
      message: 'All cart items are available for checkout',
      validationResults,
      totalValidItems: validationResults.validItems.length,
      checkoutEligibleItems: checkoutEligibleItems.length
    });

  } catch (error) {
    console.error('Error validating checkout stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cart for checkout'
    });
  }
};

// Validate cart stock (general validation)
const validateCartStock = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart || cart.items.length === 0) {
      return res.json({
        success: true,
        allValid: true,
        availableItems: [],
        outOfStockItems: [],
        invalidItems: [],
        totalItems: 0,
        availableCount: 0,
        outOfStockCount: 0
      });
    }

    const availableItems = [];
    const outOfStockItems = [];
    const invalidItems = [];
    let errorMessages = [];

    cart.items.forEach(item => {
      const itemData = {
        productId: item.productId._id,
        variantId: item.variantId,
        productName: item.productId.productName,
        size: item.size,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      };

      // Check availability (variant-specific)
      let isAvailable = true;
      let reason = '';

      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        isAvailable = false;
        reason = 'Product unavailable';
        errorMessages.push(`${item.productId.productName} is no longer available`);
      } else if (item.productId.category && 
                 (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
        isAvailable = false;
        reason = 'Category unavailable';
        errorMessages.push(`${item.productId.productName} category is no longer available`);
      } else if (item.productId.brand && 
                 (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
        isAvailable = false;
        reason = 'Brand unavailable';
        errorMessages.push(`${item.productId.productName} brand is no longer available`);
      } else if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          isAvailable = false;
          reason = 'Variant not found';
          errorMessages.push(`${item.productId.productName} (Size: ${item.size}) variant not found`);
        } else if (variant.stock === 0) {
          isAvailable = false;
          reason = `Size ${item.size} - Out of stock`;
          errorMessages.push(`${item.productId.productName} (Size: ${item.size}) is out of stock`);
        } else if (variant.stock < item.quantity) {
          isAvailable = false;
          reason = `Size ${item.size} - Only ${variant.stock} available`;
          itemData.availableStock = variant.stock;
          errorMessages.push(`${item.productId.productName} (Size: ${item.size}) - Only ${variant.stock} available, but you have ${item.quantity} in cart`);
        } else {
          itemData.stock = variant.stock;
          itemData.availableStock = variant.stock;
        }
      }

      if (isAvailable) {
        availableItems.push(itemData);
      } else {
        const invalidItem = {
          ...itemData,
          reason
        };
        
        if (reason.includes('Out of stock')) {
          outOfStockItems.push(invalidItem);
        } else {
          invalidItems.push(invalidItem);
        }
      }
    });

    const allValid = invalidItems.length === 0 && outOfStockItems.length === 0;
    const errorMessage = errorMessages.length > 0 ? errorMessages.join('\n') : '';

    res.json({
      success: true,
      allValid,
      errorMessage,
      availableItems,
      outOfStockItems,
      invalidItems,
      totalItems: cart.items.length,
      availableCount: availableItems.length,
      outOfStockCount: outOfStockItems.length,
      invalidCount: invalidItems.length
    });

  } catch (error) {
    console.error('Error validating cart stock:', error);
    res.status(500).json({
      success: false,
      allValid: false,
      errorMessage: 'Failed to validate cart stock',
      message: 'Failed to validate cart stock'
    });
  }
};

// Reset cart item quantity to available stock
const resetCartItemQuantity = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { productId, variantId } = req.body;

    if (!productId || !variantId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and variant ID are required'
      });
    }

    // Get product with category and brand for price calculation
    const product = await Product.findById(productId).populate(['category', 'brand']);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Find the specific variant
    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the specific item in cart
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found in cart'
      });
    }

    if (variant.stock === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reset quantity - item is out of stock',
        code: 'OUT_OF_STOCK'
      });
    }

    // Reset quantity to available stock (max 5)
    const newQuantity = Math.min(variant.stock, 5);
    const finalPrice = calculateVariantFinalPrice(product, variant);
    
    cart.items[itemIndex].quantity = newQuantity;
    cart.items[itemIndex].price = finalPrice;
    cart.items[itemIndex].totalPrice = calculateItemTotal(finalPrice, newQuantity);

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: `Quantity reset to ${newQuantity} (available stock)`,
      newQuantity,
      cartCount,
      itemTotal: cart.items[itemIndex].totalPrice
    });

  } catch (error) {
    console.error('Error resetting cart item quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset item quantity'
    });
  }
};

// Save item for later (move from cart to wishlist)
const saveForLater = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { productId, variantId } = req.body;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: 'Variant ID is required'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the specific item in cart
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found in cart'
      });
    }

    // Get the cart item details
    const cartItem = cart.items[itemIndex];

    // Verify product exists and is valid
    const product = await Product.findById(productId);
    if (!product || !product.isListed || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product is no longer available'
      });
    }

    // Remove item from cart first
    cart.items.splice(itemIndex, 1);
    await cart.save();

    // Add to wishlist
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    // Check if product already in wishlist (avoid duplicates)
    const existingWishlistItem = wishlist.products.find(
      item => item.productId.toString() === productId
    );

    if (!existingWishlistItem) {
      wishlist.products.push({ productId });
      await wishlist.save();
    }

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    // Get updated wishlist count
    const wishlistCount = wishlist.products.length;

    res.json({
      success: true,
      message: 'Item saved to wishlist successfully',
      cartCount,
      wishlistCount
    });

  } catch (error) {
    console.error('Error saving item for later:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to save item for later'
    });
  }
};

const getWalletBalanceForCheckout = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        balance: 0
      });
    }

    const walletBalance = await walletService.getWalletBalance(userId);
    
    if (!walletBalance.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get wallet balance',
        balance: 0
      });
    }

    res.json({
      success: true,
      balance: walletBalance.balance || 0,
      formatted: `₹${(walletBalance.balance || 0).toLocaleString('en-IN')}`
    });

  } catch (error) {
    console.error('Error getting wallet balance for checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting wallet balance',
      balance: 0
    });
  }
};

module.exports = {
  addToCart,
  getCartCount,
  loadCart,
  removeFromCart,
  updateCartQuantity,
  clearCart,
  removeOutOfStockItems,
  validateCartItems,
  checkAuth,
  loadCheckout,
  validateCheckoutStock,
  validateCartStock,
  resetCartItemQuantity,
  saveForLater,
  getWalletBalanceForCheckout
}