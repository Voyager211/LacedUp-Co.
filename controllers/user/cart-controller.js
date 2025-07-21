const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');

// Helper function to calculate final price with offers
const calculateFinalPrice = async (product) => {
  // Populate brand and category if not already populated
  if (!product.brand || !product.category) {
    await product.populate(['brand', 'category']);
  }
  
  // Get the average final price from the product model
  return product.getAverageFinalPrice();
};

// Helper function to calculate item total
const calculateItemTotal = (price, quantity) => {
  return price * quantity;
};

// Load cart page (SKU-based)
exports.loadCart = async (req, res) => {
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
            select: 'name brandOffer'
          }
        ]
      });

    // Filter out items with unavailable products and validate variants
    let cartItems = [];
    let priceUpdatesNeeded = false;
    
    if (cart && cart.items) {
      cartItems = cart.items.filter(item => {
        // Check if product exists and is available
        if (!item.productId || 
            !item.productId.category || 
            !item.productId.category.isListed || 
            item.productId.category.isDeleted ||
            !item.productId.isListed ||
            item.productId.isDeleted) {
          return false;
        }

        // Check if variant exists in the product (for SKU-based items)
        if (item.variantId) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (!variant) {
            console.log(`Variant ${item.variantId} not found for product ${item.productId._id}`);
            return false;
          }
        }

        return true;
      });

      // Update prices and add calculated data for the view
      cartItems = cartItems.map(item => {
        const itemObj = item.toObject();
        
        // Find the specific variant for price calculation (for SKU-based items)
        if (item.variantId) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant) {
            // Calculate the current price for this variant
            const currentPrice = item.productId.calculateVariantFinalPrice(variant);
            
            // Check if price needs updating
            if (Math.abs(item.price - currentPrice) > 0.01) {
              priceUpdatesNeeded = true;
              // Update the price in the cart item object for display
              itemObj.price = currentPrice;
              itemObj.totalPrice = currentPrice * item.quantity;
            }
          }
        }
        
        // Add sale price to the product object for compatibility
        itemObj.productId.salePrice = item.productId.getAverageFinalPrice();
        
        return itemObj;
      });

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
                  const currentPrice = product.calculateVariantFinalPrice(variant);
                  cartItem.price = currentPrice;
                  cartItem.totalPrice = currentPrice * cartItem.quantity;
                }
              }
            }
          }
          await cart.save();
          console.log('Cart prices updated successfully');
        } catch (updateError) {
          console.error('Error updating cart prices:', updateError);
        }
      }
    }

    res.render('user/cart', {
      user,
      cartItems: cartItems || [],
      title: 'My Cart',
      layout: 'user/layouts/user-layout',
      active: 'cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.status(500).render('error', { message: 'Error loading cart' });
  }
};

// Add product to cart with comprehensive validation (SKU-based)
exports.addToCart = async (req, res) => {
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
    const product = await Product.findById(productId).populate(['category', 'brand']);

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
    if (!product.category || !product.category.isListed || product.category.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product category is no longer available',
        code: 'CATEGORY_UNAVAILABLE'
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
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: []
      });
    }

    // Check if this specific variant already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

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

      // Calculate final price with offers for this specific variant
      const finalPrice = product.calculateVariantFinalPrice(variant);
      
      existingItem.quantity = newQuantity;
      existingItem.price = finalPrice;
      existingItem.totalPrice = calculateItemTotal(finalPrice, newQuantity);
    } else {
      // Calculate final price with offers for this specific variant
      const finalPrice = product.calculateVariantFinalPrice(variant);
      
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

    await cart.save();

    // Wishlist functionality will be implemented later
    let wishlistCount = 0;

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: `Product (Size: ${variant.size}) added to cart successfully`,
      cartCount,
      wishlistCount
    });

  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart'
    });
  }
};

// Get cart count for navbar
exports.getCartCount = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.json({ count: 0 });
    }

    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;

    res.json({ count });

  } catch (error) {
    console.error('Error getting cart count:', error);
    res.json({ count: 0 });
  }
};

// Update cart item quantity (SKU-based)
exports.updateCartQuantity = async (req, res) => {
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

    // Check product and category availability
    if (!product.isListed || product.isDeleted ||
        !product.category || !product.category.isListed || product.category.isDeleted) {
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

    // Calculate final price with offers for this specific variant
    const finalPrice = product.calculateVariantFinalPrice(variant);
    
    // Update quantity and total price
    cart.items[itemIndex].quantity = parsedQuantity;
    cart.items[itemIndex].price = finalPrice;
    cart.items[itemIndex].totalPrice = calculateItemTotal(finalPrice, parsedQuantity);

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cartCount,
      itemTotal: cart.items[itemIndex].totalPrice
    });

  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};

// Remove item from cart (SKU-based)
exports.removeFromCart = async (req, res) => {
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

// Clear entire cart
exports.clearCart = async (req, res) => {
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
exports.removeOutOfStockItems = async (req, res) => {
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
          !item.productId.category ||
          !item.productId.category.isListed ||
          item.productId.category.isDeleted ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
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
exports.validateCartItems = async (req, res) => {
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
          !item.productId.category ||
          !item.productId.category.isListed ||
          item.productId.category.isDeleted ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        isAvailable = false;
        reason = 'Product unavailable';
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
exports.checkAuth = async (req, res) => {
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