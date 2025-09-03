const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Order = require('../../models/Order');
const Coupon = require('../../models/Coupon');
const walletService = require('../../services/walletService');
const { paypalClient } = require('../../services/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const razorpayService = require('../../services/razorpay');
const { validateCoupon, calculateDiscount } = require('../../utils/couponValidation');


const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  CANCELLATION_REASONS, 
  RETURN_REASONS,
  getOrderStatusArray,
  getPaymentStatusArray,
  getCancellationReasonsArray,
  getReturnReasonsArray
} = require('../../constants/orderEnums');

// ✅ NEW: Enhanced cart restoration with stock validation
async function restoreCartAfterPaymentFailure(userId, transactionId) {
  try {
    console.log('🔄 Starting enhanced cart restoration for user:', userId);

    // Get transaction details to find cart items
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);
    
    if (!transactionResult.success) {
      console.log('⚠️ Transaction not found, skipping cart restoration');
      return { success: true, message: 'No transaction found to restore from' };
    }

    const transaction = transactionResult.transaction;
    if (!transaction.orderData || !transaction.orderData.items) {
      console.log('⚠️ No cart items found in transaction, skipping restoration');
      return { success: true, message: 'No items to restore' };
    }

    // ✅ ENHANCED: Validate stock availability before restoration
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    let restoredItems = 0;
    let skippedItems = 0;
    const restorationLog = [];

    for (const originalItem of transaction.orderData.items) {
      try {
        // Check if product still exists and is available
        const product = await Product.findById(originalItem.productId)
          .populate(['category', 'brand']);

        if (!product || !product.isListed || product.isDeleted) {
          skippedItems++;
          restorationLog.push({
            productId: originalItem.productId,
            status: 'skipped',
            reason: 'Product no longer available'
          });
          continue;
        }

        // Check category and brand availability
        if ((product.category && (!product.category.isListed || product.category.isDeleted)) ||
            (product.brand && (!product.brand.isActive || product.brand.isDeleted))) {
          skippedItems++;
          restorationLog.push({
            productId: originalItem.productId,
            status: 'skipped',
            reason: 'Product category/brand unavailable'
          });
          continue;
        }

        // Check variant stock
        const variant = product.variants.find(v => v._id.toString() === originalItem.variantId.toString());
        if (!variant) {
          skippedItems++;
          restorationLog.push({
            productId: originalItem.productId,
            status: 'skipped',
            reason: 'Product variant not found'
          });
          continue;
        }

        // Check if item is already in cart
        const existingItemIndex = cart.items.findIndex(
          item => item.productId.toString() === originalItem.productId.toString() &&
                  item.variantId.toString() === originalItem.variantId.toString()
        );

        if (existingItemIndex > -1) {
          // Update existing item quantity (up to stock limit)
          const currentQty = cart.items[existingItemIndex].quantity;
          const desiredQty = Math.min(originalItem.quantity, variant.stock, 5);
          const newQty = Math.min(currentQty + desiredQty, variant.stock, 5);
          
          if (newQty > currentQty) {
            cart.items[existingItemIndex].quantity = newQty;
            cart.items[existingItemIndex].totalPrice = cart.items[existingItemIndex].price * newQty;
            restoredItems++;
            restorationLog.push({
              productId: originalItem.productId,
              status: 'updated',
              reason: `Quantity updated from ${currentQty} to ${newQty}`
            });
          } else {
            restorationLog.push({
              productId: originalItem.productId,
              status: 'unchanged',
              reason: 'Item already at maximum quantity in cart'
            });
          }
        } else {
          // Add new item (up to stock limit)
          const quantityToAdd = Math.min(originalItem.quantity, variant.stock, 5);
          
          if (quantityToAdd > 0) {
            // Calculate current price
            const currentPrice = calculateVariantFinalPrice(product, variant);
            
            cart.items.push({
              productId: originalItem.productId,
              variantId: originalItem.variantId,
              sku: originalItem.sku,
              size: originalItem.size,
              quantity: quantityToAdd,
              price: currentPrice,
              totalPrice: currentPrice * quantityToAdd
            });
            
            restoredItems++;
            restorationLog.push({
              productId: originalItem.productId,
              status: 'restored',
              reason: `Added ${quantityToAdd} items to cart`
            });
          } else {
            skippedItems++;
            restorationLog.push({
              productId: originalItem.productId,
              status: 'skipped',
              reason: 'Out of stock'
            });
          }
        }

      } catch (itemError) {
        console.error('❌ Error processing item restoration:', itemError);
        skippedItems++;
        restorationLog.push({
          productId: originalItem.productId,
          status: 'error',
          reason: `Restoration error: ${itemError.message}`
        });
      }
    }

    // Save cart if any items were restored
    if (restoredItems > 0) {
      await cart.save();
    }

    console.log('✅ Cart restoration completed:', {
      restoredItems,
      skippedItems,
      totalOriginalItems: transaction.orderData.items.length
    });

    return {
      success: true,
      restoredItems,
      skippedItems,
      totalItems: transaction.orderData.items.length,
      restorationLog,
      message: `${restoredItems} items restored to cart${skippedItems > 0 ? `, ${skippedItems} items skipped` : ''}`
    };

  } catch (error) {
    console.error('❌ Cart restoration failed:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to restore cart items'
    };
  }
}

// ✅ NEW: Generate smart failure response
function generateFailureResponse(reason, failureType, retryCount = 0, cartResult) {
  const maxRetries = 3;
  const baseRetryDelay = 2000; // 2 seconds

  // Determine if retry is possible
  const canRetry = retryCount < maxRetries && 
                   !['insufficient_funds', 'card_declined', 'cancelled'].includes(failureType);

  // Calculate retry delay (exponential backoff)
  const retryDelay = baseRetryDelay * Math.pow(2, retryCount);

  // Generate suggested actions based on failure type
  let suggestedActions = [];
  let redirectUrl = '/cart';

  switch (failureType) {
    case 'network_error':
    case 'timeout':
      suggestedActions = [
        'Check your internet connection',
        'Try again in a few moments',
        'Use a different payment method if the issue persists'
      ];
      if (canRetry) redirectUrl = '/checkout';
      break;

    case 'insufficient_funds':
      suggestedActions = [
        'Check your account balance',
        'Try a different payment method',
        'Use wallet payment if you have sufficient balance'
      ];
      break;

    case 'card_declined':
      suggestedActions = [
        'Contact your bank to ensure the card is active',
        'Try a different card',
        'Use UPI or wallet payment instead'
      ];
      break;

    case 'cancelled':
      suggestedActions = [
        'Your cart items have been restored',
        'Continue with your purchase when ready',
        'Try a different payment method if needed'
      ];
      redirectUrl = '/checkout';
      break;

    case 'technical_error':
    default:
      suggestedActions = [
        'This appears to be a temporary technical issue',
        'Please try again in a moment',
        'Contact support if the problem continues'
      ];
      if (canRetry) redirectUrl = '/checkout';
      break;
  }

  return {
    canRetry,
    retryDelay,
    suggestedActions,
    redirectUrl,
    maxRetriesReached: retryCount >= maxRetries
  };
}

// ✅ NEW: Log payment failures for analytics
async function logPaymentFailure(userId, transactionId, reason, failureType, retryCount) {
  try {
    // You can implement this to log to your analytics service
    // or store in a separate collection for failure analysis
    console.log('📊 Payment failure logged:', {
      userId,
      transactionId,
      reason,
      failureType,
      retryCount,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Error logging payment failure:', error);
  }
}

// Helper function to calculate variant-specific final price
const calculateVariantFinalPrice = (product, variant) => {
  try {
    // Try to use product's calculateVariantFinalPrice method if it exists
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

// Load checkout page
exports.loadCheckout = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's addresses
    const userAddresses = await Address.findOne({ userId }).lean();
    const addresses = userAddresses ? userAddresses.address : [];

    // Get user's wallet balance
    const walletService = require('../../services/walletService');
    let walletBalance = 0;
    try {
      const walletResult = await walletService.getWalletBalance(userId);
      if (walletResult && walletResult.success) {
        walletBalance = walletResult.balance || 0;
      }
      console.log(`✅ Wallet balance loaded for checkout: ₹${walletBalance}`);
    } catch (walletError) {
      console.error('❌ Error fetching wallet balance for checkout:', walletError);
      // Continue with 0 balance
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

    let cartItems = [];
    let subtotal = 0;
    let totalItemCount = 0;
    let totalDiscount = 0;

    if (cart && cart.items) {
      // Filter out unavailable items and calculate totals
      cartItems = cart.items.filter(item => {
        // Check if product exists and is available
        if (!item.productId || 
            !item.productId.isListed ||
            item.productId.isDeleted) {
          return false;
        }

        // Check category availability
        if (item.productId.category && 
            (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
          return false;
        }

        // Check brand availability
        if (item.productId.brand && 
            (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
          return false;
        }

        // Check variant stock
        if (item.variantId) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
            return false;
          }
        }

        return true;
      });

      // Calculate totals
      cartItems.forEach(item => {
        subtotal += item.totalPrice || (item.price * item.quantity);
        totalItemCount += item.quantity;
      });
    }

    // Calculate shipping (free shipping for orders above ₹500)
    const shipping = subtotal >= 500 ? 0 : 50;
    
    // Calculate total
    const total = subtotal + shipping - totalDiscount;

    // If cart is empty or no valid items, redirect to cart
    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    res.render('user/checkout', {
      user,
      cartItems,
      addresses,
      walletBalance,
      subtotal: Math.round(subtotal),
      totalItemCount,
      totalDiscount,
      shipping,
      total: Math.round(total),
      title: 'Checkout',
      layout: 'user/layouts/user-layout',
      active: 'checkout',
      paypalClientId: process.env.PAYPAL_CLIENT_ID,
      geoapifyApiKey: process.env.GEOAPIFY_API_KEY
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Error loading checkout page' });
  }
};

// Get wallet balance for checkout
exports.getWalletBalanceForCheckout = async (req, res) => {
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

// Validate cart stock for checkout
exports.validateCheckoutStock = async (req, res) => {
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

// COUPON MANAGEMENT
// Apply coupon endpoint
exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;
    
    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
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
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }
    
    // Use EXACT same filtering and calculation logic as checkout
    const validCartItems = cart.items.filter(item => {
      // Check if product exists and is available
      if (!item.productId || 
          !item.productId.isListed ||
          item.productId.isDeleted) {
        return false;
      }

      // Check category availability
      if (item.productId.category && 
          (item.productId.category.isListed === false || item.productId.category.isDeleted === true)) {
        return false;
      }

      // Check brand availability
      if (item.productId.brand && 
          (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
        return false;
      }

      // Check variant stock
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
          return false;
        }
      }

      return true;
    });

    // Calculate total using SAME logic as checkout (with totalPrice)
    let cartTotal = 0;
    validCartItems.forEach(item => {
      cartTotal += item.totalPrice || (item.price * item.quantity);  // ✅ Now matches checkout
    });
    
    console.log('🔍 Cart total for coupon validation:', cartTotal);
    console.log('🔍 Valid items count:', validCartItems.length);
    
    // Validate coupon
    const validation = await validateCoupon(couponCode, userId, cartTotal);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }
    
    // Calculate discount
    const discountAmount = calculateDiscount(validation.coupon, cartTotal);
    const finalTotal = cartTotal - discountAmount;
    
    // Store coupon in session for checkout
    req.session.appliedCoupon = {
      code: validation.coupon.code,
      name: validation.coupon.name,
      discountAmount,
      couponId: validation.coupon._id
    };
    
    res.json({
      success: true,
      message: 'Coupon applied successfully',
      discount: {
        couponCode: validation.coupon.code,
        couponName: validation.coupon.name,
        discountAmount,
        cartTotal,
        finalTotal
      }
    });
    
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying coupon'
    });
  }
};


// Remove coupon endpoint
exports.removeCoupon = async (req, res) => {
  try {
    // Remove coupon from session
    delete req.session.appliedCoupon;
    
    // Get updated cart total using your existing logic
    const cart = await Cart.findOne({ userId: req.user ? req.user._id : req.session.userId })
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
    
    let cartTotal = 0;
    if (cart) {
      cart.items.forEach(item => {
        if (item.productId && 
            item.productId.isListed && 
            !item.productId.isDeleted &&
            (!item.productId.category || (item.productId.category.isListed && !item.productId.category.isDeleted)) &&
            (!item.productId.brand || (item.productId.brand.isActive && !item.productId.brand.isDeleted))) {
          
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant && variant.stock >= item.quantity) {
            cartTotal += item.price * item.quantity;
          }
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Coupon removed successfully',
      cartTotal
    });
    
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing coupon'
    });
  }
};


// Place order
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    // Redirect UPI and PayPal to transaction-based flow
    if (paymentMethod === 'upi' || paymentMethod === 'paypal') {
      return exports.createTransactionForPayment(req, res);
    }

    // Validate input
    if (!deliveryAddressId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isActive isDeleted categoryOffer'
          },
          {
            path: 'brand',
            select: 'name isActive isDeleted brandOffer'
          }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Get delivery address
    const userAddresses = await Address.findOne({ userId });
    if (!userAddresses || !userAddresses.address) {
      return res.status(400).json({
        success: false,
        message: 'No addresses found'
      });
    }

    const addressIndex = userAddresses.address.findIndex(addr => addr._id.toString() === deliveryAddressId);
    if (addressIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address not found'
      });
    }

    const deliveryAddress = userAddresses.address[addressIndex];

    // Validate cart items and calculate totals
    let validItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalItemCount = 0;
    let stockIssues = [];

    for (const item of cart.items) {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check category and brand availability
      if ((item.productId.category &&
          (item.productId.category.isActive === false || item.productId.category.isDeleted === true)) ||
          (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true))) {
        stockIssues.push({
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          error: 'Product category or brand is no longer available'
        });
        continue;
      }

      // Check variant availability
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            error: 'Product variant not found'
          });
          continue;
        }

        if (variant.stock === 0) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: 0,
            error: `Size ${item.size} is out of stock`
          });
          continue;
        }

        if (variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant.stock,
            error: `Only ${variant.stock} items available for size ${item.size}`
          });
          continue;
        }

        // Calculate prices
        const regularPrice = item.productId.regularPrice;
        const salePrice = calculateVariantFinalPrice(item.productId, variant);
        const quantity = item.quantity;
        
        subtotal += regularPrice * quantity;
        totalItemCount += quantity;
        
        const itemDiscount = (regularPrice - salePrice) * quantity;
        totalDiscount += itemDiscount;

        validItems.push({
          productId: item.productId._id,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: quantity,
          price: salePrice,
          totalPrice: salePrice * quantity,
          regularPrice: regularPrice
        });

        // Update product stock
        variant.stock -= quantity;
        await item.productId.save();
      }
    }

    // If there are any stock issues, return error instead of placing partial order
    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items found in cart',
        code: 'NO_VALID_ITEMS'
      });
    }

    // Calculate final amounts
    const amountAfterDiscount = subtotal - totalDiscount;
    const shipping = amountAfterDiscount > 500 ? 0 : 50;
    
    // Handle applied coupon - ADD THIS BEFORE ORDER CREATION
    let couponDiscount = 0;
    let appliedCouponId = null;

    if (req.session.appliedCoupon) {
      // Re-validate coupon before processing
      const validation = await validateCoupon(
        req.session.appliedCoupon.code,
        userId,
        subtotal
      );
      
      if (validation.valid) {
        couponDiscount = calculateDiscount(validation.coupon, subtotal);
        appliedCouponId = validation.coupon._id;
        
        // Update coupon usage
        await Coupon.findByIdAndUpdate(appliedCouponId, {
          $inc: { usedCount: 1 },
          $push: {
            usedBy: {
              user: userId,
              usedAt: new Date(),
              orderId: null // Will be updated after order creation
            }
          }
        });
      }
    }

    // Final calculations
    const amountAfterDiscountWithCoupon = amountAfterDiscount - couponDiscount;
    const finalTotal = amountAfterDiscountWithCoupon + shipping;

    // Generate order ID
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);

    // Create order using original paymentMethod (no mapping)
    const newOrder = new Order({
      orderId: orderId,
      user: userId,
      items: validItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        status: ORDER_STATUS.PENDING,
        paymentStatus: (paymentMethod === 'cod' || paymentMethod === 'upi' || paymentMethod === 'paypal') ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COMPLETED
      })),
      deliveryAddress: {
        addressId: userAddresses._id,
        addressIndex: addressIndex
      },
      paymentMethod: paymentMethod,
      subtotal: Math.round(subtotal),
      totalDiscount: Math.round(totalDiscount),
      amountAfterDiscount: Math.round(amountAfterDiscount),
      shipping: shipping,
      totalAmount: Math.round(finalTotal), // Use finalTotal with coupon discount
      totalItemCount: totalItemCount,
      status: ORDER_STATUS.PENDING,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order placed'
      }],
      paymentStatus: (paymentMethod === 'cod' || paymentMethod === 'upi' || paymentMethod === 'paypal') ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COMPLETED,
      couponApplied: appliedCouponId, // ADD THIS
      couponDiscount: Math.round(couponDiscount) // ADD THIS
    });

    await newOrder.save();
    console.log(`✅ Order created successfully: ${orderId}`);

    // Update coupon usage with order ID
    if (appliedCouponId) {
      await Coupon.findOneAndUpdate(
        { 
          _id: appliedCouponId,
          'usedBy.user': userId,
          'usedBy.orderId': null
        },
        {
          $set: { 'usedBy.$.orderId': newOrder._id }
        }
      );
    }

    // Clear applied coupon from session
    delete req.session.appliedCoupon;

    // ✅ Process wallet payment if selected
    if (paymentMethod === 'wallet') {
      try {
        console.log(`🔄 Deducting ₹${total} from wallet for order ${orderId}`);
        
        const walletResult = await walletService.debitAmount(
          userId.toString(),
          total,
          `Payment for order ${orderId}`,
          orderId
        );
        
        if (!walletResult.success) {
          // Rollback: Delete the created order
          await Order.findOneAndDelete({ orderId: orderId });
          console.error('❌ Wallet deduction failed, order rolled back');
          
          return res.status(400).json({
            success: false,
            message: 'Wallet payment failed. Order has been cancelled.',
            error: walletResult.message || 'Wallet deduction failed'
          });
        }
        
        console.log(`✅ Wallet payment successful: ₹${total} deducted, new balance: ₹${walletResult.newBalance}`);
        
      } catch (walletError) {
        console.error('❌ Wallet payment error:', walletError);
        
        // Rollback: Delete the created order and restore stock
        await Order.findOneAndDelete({ orderId: orderId });
        
        // Restore stock for all items
        for (const item of validItems) {
          const product = await Product.findById(item.productId);
          if (product) {
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (variant) {
              variant.stock += item.quantity;
              await product.save();
            }
          }
        }
        
        return res.status(500).json({
          success: false,
          message: 'Wallet payment processing failed. Order has been cancelled.',
          error: walletError.message
        });
      }
    }

    // Clear cart
    cart.items = [];
    await cart.save();

    console.log(`🎉 Order placement completed successfully: ${orderId}, Payment: ${paymentMethod}`);

    // ✅ FIXED: Update response logic
    if (paymentMethod === 'cod') {
      return res.json({
        success: true,
        message: 'Order placed successfully',
        orderId: orderId,
        redirectUrl: `/checkout/order-success/${orderId}`,
        paymentMethod: paymentMethod
      });
    }

    if (paymentMethod === 'wallet') {
      return res.json({
        success: true,
        message: 'Order placed successfully! Payment completed via wallet.',
        orderId: orderId,
        redirectUrl: `/checkout/order-success/${orderId}`,
        paymentMethod: paymentMethod,
        totalAmount: total
      });
    }

    // ✅ FIXED: UPI (Razorpay) response
    if (paymentMethod === 'upi') {
      return res.json({
        success: true,
        message: 'Order placed successfully - awaiting UPI payment',
        orderId: orderId,
        paymentMethod: 'upi', // ✅ Keep as 'upi'
        totalAmount: total
      });
    }

    // ✅ FIXED: PayPal response
    if (paymentMethod === 'paypal') {
      return res.json({
        success: true,
        message: 'Order placed successfully - awaiting PayPal payment',
        orderId: orderId,
        paymentMethod: 'paypal',
        totalAmount: total
      });
    }

    // For other payment methods
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: orderId,
      redirectUrl: `/checkout/order-success/${orderId}`,
      paymentMethod: paymentMethod
    });

  } catch (error) {
    console.error('❌ Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order'
    });
  }
};

// Enhanced place order with stock validation
exports.placeOrderWithValidation = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    // First, validate cart stock
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [{
          path: 'category',
          select: 'name isActive isDeleted categoryOffer'
        }, {
          path: 'brand',
          select: 'name isActive isDeleted brandOffer'
        }]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    // Validate stock and availability for all items
    const stockIssues = [];
    for (const item of cart.items) {
      if (!item.productId || !item.productId.isListed || item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check category and brand availability
      if ((item.productId.category &&
          (item.productId.category.isActive === false || item.productId.category.isDeleted === true)) ||
          (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true))) {
        stockIssues.push({
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          error: 'Product category or brand is no longer available'
        });
        continue;
      }

      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant ? variant.stock : 0,
            error: variant ? `Only ${variant.stock} items available` : 'Product variant not found'
          });
        }
      }
    }

    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    // If validation passes, proceed with original place order logic
    return exports.placeOrder(req, res);

  } catch (error) {
    console.error('Error in place order validation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate and place order',
      code: 'VALIDATION_ERROR'
    });
  }
};

// Load order success page
exports.loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Get order details with populated product data and address
    const order = await Order.findOne({ orderId: orderId, user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages regularPrice salePrice'
      })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      });

    if (!order) {
      return res.status(404).send('Order not found');
    }

    // Get the actual delivery address from the populated address document
    let actualDeliveryAddress = null;
    if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
      const addressIndex = order.deliveryAddress.addressIndex;
      actualDeliveryAddress = order.deliveryAddress.addressId.address[addressIndex];
    }

    // Create order data with proper product and address information
    const orderData = {
      orderId: order.orderId,
      items: order.items.map(item => {
        const itemObj = item.toObject();
        
        // Ensure product data is available
        if (item.productId && typeof item.productId === 'object') {
          itemObj.productId = {
            _id: item.productId._id,
            productName: item.productId.productName || 'Product Name',
            mainImage: item.productId.mainImage || null,
            subImages: item.productId.subImages || []
          };
        } else {
          // Fallback if product is not populated
          itemObj.productId = {
            _id: itemObj.productId,
            productName: 'Product Name',
            mainImage: null,
            subImages: []
          };
        }
        
        return itemObj;
      }),
      deliveryAddress: actualDeliveryAddress || {
        name: 'Address not found',
        addressType: 'N/A',
        landMark: 'N/A',
        city: 'N/A',
        state: 'N/A',
        pincode: 'N/A',
        phone: 'N/A'
      },
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      totalDiscount: order.totalDiscount,
      amountAfterDiscount: order.amountAfterDiscount,
      shipping: order.shipping,
      total: order.totalAmount,
      totalItemCount: order.totalItemCount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt
    };

    res.render('user/order-success', {
      user,
      orderData,
      title: 'Order Placed Successfully',
      layout: 'user/layouts/user-layout',
      active: 'orders'
    });

  } catch (error) {
    console.error('Error loading order success page:', error);
    res.status(500).send('Error loading order success page: ' + error.message);
  }
};

// Load order failure page
exports.loadOrderFailure = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const user = req.user || { fullname: 'User' };
    
    // Get transaction ID from params or query
    const transactionId = req.params.transactionId || req.query.transactionId;
    
    res.render('user/order-failure', {
      user,
      transactionId: transactionId, // ✅ Pass transaction ID to template
      paypalClientId: process.env.PAYPAL_CLIENT_ID, // ✅ Pass PayPal client ID
      title: 'Payment Failed',
      layout: 'user/layouts/user-layout',
      active: 'orders'
    });
  } catch (error) {
    console.error('Error loading order failure page:', error);
    res.status(500).render('error', { message: 'Error loading failure page' });
  }
};



// Create transaction for order of UPI/PayPal payments
exports.createTransactionForPayment = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    console.log('🔄 Creating transaction for payment:', { paymentMethod, deliveryAddressId });

    // Validate input
    if (!deliveryAddressId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isActive isDeleted categoryOffer'
          },
          {
            path: 'brand',
            select: 'name isActive isDeleted brandOffer'
          }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Validate cart items and calculate totals
    let validItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalItemCount = 0;
    let stockIssues = [];

    for (const item of cart.items) {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check variant availability
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            error: 'Product variant not found'
          });
          continue;
        }

        if (variant.stock === 0) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: 0,
            error: `Size ${item.size} is out of stock`
          });
          continue;
        }

        if (variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant.stock,
            error: `Only ${variant.stock} items available for size ${item.size}`
          });
          continue;
        }

        // Calculate prices
        const regularPrice = item.productId.regularPrice;
        const salePrice = calculateVariantFinalPrice(item.productId, variant);
        const quantity = item.quantity;
        
        subtotal += regularPrice * quantity;
        totalItemCount += quantity;
        
        const itemDiscount = (regularPrice - salePrice) * quantity;
        totalDiscount += itemDiscount;

        validItems.push({
          productId: item.productId._id,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: quantity,
          price: salePrice,
          totalPrice: salePrice * quantity,
          regularPrice: regularPrice
        });
      }
    }

    // If there are any stock issues, return error
    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items found in cart',
        code: 'NO_VALID_ITEMS'
      });
    }

    // Calculate final amounts
    const amountAfterDiscount = subtotal - totalDiscount;
    const shipping = amountAfterDiscount > 500 ? 0 : 50;
    const total = amountAfterDiscount + shipping;

    // ✅ FIXED: Safe request data extraction with fallbacks
    const transactionService = require('../../services/transactionService');
    
    const transactionResult = await transactionService.createOrderTransaction({
      userId: userId,
      paymentMethod: paymentMethod,
      deliveryAddressId: deliveryAddressId,
      amount: total,
      cartItems: validItems,
      pricing: {
        subtotal: Math.round(subtotal),
        totalDiscount: Math.round(totalDiscount),
        amountAfterDiscount: Math.round(amountAfterDiscount),
        shipping: shipping,
        total: Math.round(total),
        totalItemCount: totalItemCount
      },
      // ✅ FIXED: Safe access with fallbacks
      userAgent: (req.headers && req.headers['user-agent']) || req.get('User-Agent') || 'Unknown',
      ipAddress: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'Unknown',
      sessionId: req.sessionID || req.session?.id || 'Unknown'
    });

    if (!transactionResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment transaction'
      });
    }

    console.log(`✅ Transaction created: ${transactionResult.transactionId}`);

    res.json({
      success: true,
      transactionId: transactionResult.transactionId,
      amount: total,
      message: 'Transaction created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment transaction'
    });
  }
};

// ===== PAYPAL PAYMENT FUNCTIONS =====

// Create PayPal order
exports.createPayPalOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, transactionId, isRetry } = req.body; // ✅ FIXED: Added retry support
    
    console.log('🔍 PayPal create-order request:', { deliveryAddressId, transactionId, isRetry, userId });
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // ✅ FIXED: Allow missing deliveryAddressId for retries
    if (!isRetry && !deliveryAddressId) {
      console.error('❌ Missing deliveryAddressId in request body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Missing delivery address. Please select a delivery address first.'
      });
    }
    
    const transactionService = require('../../services/transactionService');
    let total, validItems, currentTransactionId;

    if (isRetry && transactionId) {
      // ✅ FIXED: For retries, get data from existing transaction
      console.log('🔄 Creating PayPal retry order for transaction:', transactionId);
      
      const transactionResult = await transactionService.getTransaction(transactionId);
      
      if (!transactionResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Transaction not found for retry'
        });
      }

      const transaction = transactionResult.transaction;
      total = transaction.amount;
      validItems = transaction.orderData.items;
      currentTransactionId = transactionId;
      
    } else {
      // ✅ For new orders, calculate from cart (existing logic)
      console.log('🔄 Creating new PayPal order...');
      
      // Get user's cart and validate
      const cart = await Cart.findOne({ userId })
        .populate({
          path: 'items.productId',
          populate: ['category', 'brand']
        });

      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }

      // Calculate totals (simplified version)
      validItems = [];
      total = 0;
      
      for (const item of cart.items) {
        if (item.productId && item.productId.isListed && !item.productId.isDeleted) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant && variant.stock >= item.quantity) {
            const salePrice = calculateVariantFinalPrice(item.productId, variant);
            validItems.push({
              productId: item.productId._id,
              variantId: item.variantId,
              sku: item.sku,
              size: item.size,
              quantity: item.quantity,
              price: salePrice,
              totalPrice: salePrice * item.quantity,
              regularPrice: item.productId.regularPrice
            });
            total += salePrice * item.quantity;
          }
        }
      }

      if (validItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid items found in cart'
        });
      }

      // Add shipping
      const shipping = total > 500 ? 0 : 50;
      total += shipping;

      // ✅ Create transaction for new orders
      const transactionResult = await transactionService.createOrderTransaction({
        userId: userId,
        paymentMethod: 'paypal',
        deliveryAddressId: deliveryAddressId,
        amount: total,
        cartItems: validItems,
        pricing: {
          subtotal: total - shipping,
          totalDiscount: 0,
          amountAfterDiscount: total - shipping,
          shipping: shipping,
          total: total,
          totalItemCount: validItems.reduce((sum, item) => sum + item.quantity, 0)
        },
        userAgent: req.get('User-Agent') || 'Unknown',
        ipAddress: req.ip || 'Unknown',
        sessionId: req.sessionID || 'Unknown'
      });

      if (!transactionResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create payment transaction'
        });
      }

      currentTransactionId = transactionResult.transactionId;
    }

    // ✅ Create PayPal order
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: currentTransactionId,
        amount: {
          currency_code: 'USD',
          value: (total / 80).toFixed(2) // Rough INR to USD conversion
        },
        description: isRetry ? 
          `LacedUp Retry Transaction ${currentTransactionId}` : 
          `LacedUp Transaction ${currentTransactionId}`
      }],
      application_context: {
        brand_name: 'LacedUp',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${req.protocol}://${req.get('host')}/order-success`,
        cancel_url: `${req.protocol}://${req.get('host')}/order-failure`
      }
    });

    const paypalOrder = await paypalClient.execute(request);

    // ✅ Update transaction with gateway details
    await transactionService.updateTransactionGatewayDetails(currentTransactionId, {
      paypalOrderId: paypalOrder.result.id,
      gatewayResponse: paypalOrder.result
    });

    console.log(`✅ PayPal order created: ${paypalOrder.result.id} for transaction: ${currentTransactionId}`);

    res.json({
      success: true,
      orderID: paypalOrder.result.id,
      transactionId: currentTransactionId
    });

  } catch (error) {
    console.error('❌ Error creating PayPal order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create PayPal order: ' + error.message
    });
  }
};


exports.capturePayPalOrder = async (req, res) => {
  try {
    const { orderID } = req.params;
    const { transactionId, isRetry } = req.body; // ✅ FIXED: Added retry handling
    const userId = req.user ? req.user._id : req.session.userId;

    console.log(`🔄 Capturing PayPal order: ${orderID}, isRetry: ${isRetry}, transactionId: ${transactionId}`);

    if (!orderID) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Capture the PayPal order
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await paypalClient.execute(request);
    console.log(`✅ PayPal order captured: ${orderID}`, capture.result);

    if (capture.result.status === 'COMPLETED') {
      const transactionService = require('../../services/transactionService');
      let transaction;

      if (isRetry && transactionId) {
        // ✅ FIXED: For retries, get existing transaction
        console.log('🔄 Processing PayPal retry capture for transaction:', transactionId);
        const transactionResult = await transactionService.getTransaction(transactionId);
        
        if (!transactionResult.success) {
          throw new Error('Transaction not found for retry');
        }
        transaction = transactionResult.transaction;
      } else {
        // For new orders, find by PayPal order ID
        const transactionResult = await transactionService.getTransactionByGatewayOrderId(orderID);
        
        if (!transactionResult.success) {
          throw new Error('Transaction not found for PayPal order');
        }
        transaction = transactionResult.transaction;
      }
      
      // Get delivery address info
      const userAddresses = await Address.findOne({ userId });
      const addressIndex = userAddresses.address.findIndex(addr => 
        addr._id.toString() === transaction.orderData.deliveryAddressId.toString()
      );
      
      // Create the order from transaction data
      const orderData = transaction.orderData;
      const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
      
      const newOrder = new Order({
        orderId: orderId,
        user: userId,
        items: orderData.items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice,
          status: ORDER_STATUS.PENDING,
          paymentStatus: PAYMENT_STATUS.COMPLETED
        })),
        deliveryAddress: {
          addressId: userAddresses._id,
          addressIndex: addressIndex
        },
        paymentMethod: 'paypal',
        subtotal: Math.round(orderData.pricing.subtotal || 0),
        totalDiscount: Math.round(orderData.pricing.totalDiscount || 0),
        amountAfterDiscount: Math.round(orderData.pricing.amountAfterDiscount || 0),
        shipping: orderData.pricing.shipping || 0,
        totalAmount: Math.round(orderData.pricing.total),
        totalItemCount: orderData.pricing.totalItemCount || 0,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        statusHistory: [{
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
          notes: isRetry ? 'Order placed via PayPal (retry)' : 'Order placed via PayPal'
        }],
        paypalOrderId: orderID,
        paypalCaptureId: capture.result.id
      });

      await newOrder.save();
      
      // Update product stock
      for (const item of orderData.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant) {
            variant.stock -= item.quantity;
            await product.save();
          }
        }
      }
      
      // Clear user's cart
      await Cart.updateOne({ userId }, { items: [] });
      
      // Update transaction status
      await transactionService.updateTransactionStatus(transaction.transactionId, 'COMPLETED', 'PayPal payment captured successfully');
      
      console.log(`✅ Order created successfully: ${orderId} for PayPal order: ${orderID}`);
      
      res.json({
        success: true,
        orderId: orderId,
        redirectUrl: `/checkout/order-success/${orderId}`,
        message: 'Payment completed successfully'
      });
    } else {
      throw new Error(`PayPal capture failed with status: ${capture.result.status}`);
    }

  } catch (error) {
    console.error('❌ PayPal capture error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment capture failed',
      error: error.message
    });
  }
};


// RAZORPAY INTEGRATION
// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId } = req.body;
    
    console.log('🔍 Razorpay create-order request body:', req.body);
    console.log('🔍 Razorpay create-order user:', userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    if (!deliveryAddressId) {
      console.error('❌ Missing deliveryAddressId in request body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Missing delivery address. Please select a delivery address first.'
      });
    }

    // ✅ FIXED: Create transaction directly using transactionService (no response sent)
    console.log('🔄 Creating transaction for payment: { paymentMethod: \'upi\', deliveryAddressId:', deliveryAddressId, '}');
    
    // Get user's cart and validate
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isActive isDeleted categoryOffer'
          },
          {
            path: 'brand', 
            select: 'name isActive isDeleted brandOffer'
          }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Validate cart items and calculate totals (same logic as createTransactionForPayment)
    let validItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalItemCount = 0;
    let stockIssues = [];

    for (const item of cart.items) {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check variant availability
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            error: 'Product variant not found'
          });
          continue;
        }

        if (variant.stock === 0) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: 0,
            error: `Size ${item.size} is out of stock`
          });
          continue;
        }

        if (variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant.stock,
            error: `Only ${variant.stock} items available for size ${item.size}`
          });
          continue;
        }

        // Calculate prices using the helper function
        const regularPrice = item.productId.regularPrice;
        const salePrice = calculateVariantFinalPrice(item.productId, variant);
        const quantity = item.quantity;
        
        subtotal += regularPrice * quantity;
        totalItemCount += quantity;
        
        const itemDiscount = (regularPrice - salePrice) * quantity;
        totalDiscount += itemDiscount;

        validItems.push({
          productId: item.productId._id,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: quantity,
          price: salePrice,
          totalPrice: salePrice * quantity,
          regularPrice: regularPrice
        });
      }
    }

    // If there are any stock issues, return error
    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items found in cart',
        code: 'NO_VALID_ITEMS'
      });
    }

    // Calculate final amounts
    const amountAfterDiscount = subtotal - totalDiscount;
    const shipping = amountAfterDiscount > 500 ? 0 : 50;
    const total = amountAfterDiscount + shipping;

    // ✅ FIXED: Create transaction using service directly (no response sent)
    const transactionService = require('../../services/transactionService');
    
    const transactionResult = await transactionService.createOrderTransaction({
      userId: userId,
      paymentMethod: 'upi',
      deliveryAddressId: deliveryAddressId,
      amount: total,
      cartItems: validItems,
      pricing: {
        subtotal: Math.round(subtotal),
        totalDiscount: Math.round(totalDiscount),
        amountAfterDiscount: Math.round(amountAfterDiscount),
        shipping: shipping,
        total: Math.round(total),
        totalItemCount: totalItemCount
      },
      userAgent: req.get('User-Agent') || 'Unknown',
      ipAddress: req.ip || 'Unknown',
      sessionId: req.sessionID || 'Unknown'
    });

    if (!transactionResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment transaction'
      });
    }

    console.log(`✅ Transaction created: ${transactionResult.transactionId}`);

    // ✅ Create Razorpay order
    const razorpayOrderResult = await razorpayService.createOrder(
      total,
      'INR',
      transactionResult.transactionId
    );

    if (!razorpayOrderResult.success) {
      console.error('❌ Razorpay order creation failed:', razorpayOrderResult);
      
      // Cancel the transaction
      await transactionService.cancelTransaction(transactionResult.transactionId, 'Razorpay order creation failed');
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create Razorpay order: ' + razorpayOrderResult.error
      });
    }

    // ✅ Update transaction with gateway details
    await transactionService.updateTransactionGatewayDetails(transactionResult.transactionId, {
      razorpayOrderId: razorpayOrderResult.order.id,
      gatewayResponse: razorpayOrderResult
    });

    console.log(`✅ Razorpay order created: ${razorpayOrderResult.order.id} for transaction: ${transactionResult.transactionId}`);

    // ✅ FIXED: Send single response only
    return res.json({
      success: true,
      razorpayOrderId: razorpayOrderResult.order.id,
      transactionId: transactionResult.transactionId,
      amount: razorpayOrderResult.order.amount,
      currency: razorpayOrderResult.order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    
    // ✅ FIXED: Only send response if headers haven't been sent
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create Razorpay order: ' + error.message
      });
    }
  }
};


exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, transactionId } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    console.log('🔄 Verifying Razorpay payment:', { razorpay_payment_id, razorpay_order_id });

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment parameters'
      });
    }

    // ✅ FIXED: Use correct function name and parameters
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature
    );

    if (!isValidSignature) {
      console.error('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    console.log('✅ Payment signature verified successfully');

    // Get transaction and create order (similar to PayPal flow)
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);
    
    if (!transactionResult.success) {
      throw new Error('Transaction not found');
    }

    const transaction = transactionResult.transaction;
    
    // Get delivery address info
    const userAddresses = await Address.findOne({ userId });
    const addressIndex = userAddresses.address.findIndex(addr => 
      addr._id.toString() === transaction.orderData.deliveryAddressId.toString()
    );
    
    // Create the order from transaction data
    const orderData = transaction.orderData;
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
    
    const newOrder = new Order({
      orderId: orderId,
      user: userId,
      items: orderData.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.COMPLETED
      })),
      deliveryAddress: {
        addressId: userAddresses._id,
        addressIndex: addressIndex
      },
      paymentMethod: 'upi',
      subtotal: Math.round(orderData.pricing.subtotal || 0),
      totalDiscount: Math.round(orderData.pricing.totalDiscount || 0),
      amountAfterDiscount: Math.round(orderData.pricing.amountAfterDiscount || 0),
      shipping: orderData.pricing.shipping || 0,
      totalAmount: Math.round(orderData.pricing.total),
      totalItemCount: orderData.pricing.totalItemCount || 0,
      status: ORDER_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order placed via UPI (Razorpay)'
      }],
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    await newOrder.save();
    
    // Update product stock
    for (const item of orderData.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variant) {
          variant.stock -= item.quantity;
          await product.save();
        }
      }
    }
    
    // Clear user's cart
    await Cart.updateOne({ userId }, { items: [] });
    
    // Update transaction status
    await transactionService.completeTransaction(transactionId, orderId, {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });
    
    console.log(`✅ Order created successfully: ${orderId} for Razorpay payment: ${razorpay_payment_id}`);
    
    res.json({
      success: true,
      orderId: orderId,
      redirectUrl: `/checkout/order-success/${orderId}`,
      message: 'Payment verified and order created successfully'
    });

  } catch (error) {
    console.error('❌ Razorpay verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
};


// Handle payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { transactionId, reason, failureType = 'payment_error', retryCount = 0, paymentMethod } = req.body;

    console.log('🚨 Processing payment failure:', { transactionId, reason, failureType, retryCount, paymentMethod });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    // Restore cart from transaction
    const cartResult = await restoreCartAfterPaymentFailure(userId, transactionId);

    // Log the failure
    await logPaymentFailure(userId, transactionId, reason, failureType, retryCount);

    // Generate failure response with suggestions
    const failureResponse = generateFailureResponse(reason, failureType, retryCount, cartResult);

    // ✅ FIXED: Set canRetry=true for both Razorpay AND PayPal failures
    const canRetry = ['upi', 'paypal'].includes(paymentMethod) && !!transactionId;

    // Build failure URL with retry parameters
    const failureUrl = `/checkout/order-failure/${transactionId}?` + new URLSearchParams({
      type: failureType,
      reason: reason,
      canRetry: canRetry.toString(),  // ✅ FIXED: Include for PayPal
      cartRestored: cartResult.success.toString(),
      retryCount: retryCount.toString(),
      retryDelay: '0',  // No auto-retry
      actions: JSON.stringify(failureResponse.suggestedActions)
    }).toString();

    // Mark transaction as failed
    const transactionService = require('../../services/transactionService');
    await transactionService.updateTransactionStatus(transactionId, 'FAILED', reason);

    res.json({
      success: true,
      redirectUrl: failureUrl
    });

  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to handle payment failure'
    });
  }
};


// Retry payment for failed transactions
exports.retryPayment = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    console.log('🔄 Retry request details:', {
      transactionId,
      userId: userId ? userId.toString() : 'undefined',
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'no method',
      sessionID: req.sessionID,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    if (!userId) {
      console.log('❌ No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please refresh the page and try again.'
      });
    }

    // Get transaction details
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success) {
      console.log('❌ Transaction not found:', transactionId);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;
    
    // ✅ FIXED: Extract user ID from transaction (handle both populated and non-populated cases)
    let transactionUserId;
    if (transaction.userId && typeof transaction.userId === 'object' && transaction.userId._id) {
      // If userId is populated with user object, get the _id
      transactionUserId = transaction.userId._id.toString();
    } else {
      // If userId is just an ObjectId
      transactionUserId = transaction.userId.toString();
    }

    console.log('🔍 Transaction found:', {
      transactionUserId,
      requestUserId: userId.toString(),
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount,
      gatewayDetails: transaction.gatewayDetails ? 'present' : 'missing'
    });

    // ✅ FIXED: Compare the extracted user IDs
    if (transactionUserId !== userId.toString()) {
      console.log('❌ User ID mismatch:', {
        transactionUser: transactionUserId,
        requestUser: userId.toString()
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to transaction'
      });
    }

    // Check if transaction is in a retryable state
    if (!['FAILED', 'CANCELLED'].includes(transaction.status)) {
      console.log('❌ Transaction not retryable:', {
        currentStatus: transaction.status,
        retryableStatuses: ['FAILED', 'CANCELLED']
      });
      return res.status(400).json({
        success: false,
        message: 'Transaction is not in a retryable state'
      });
    }

    const paymentMethod = transaction.paymentMethod;
    console.log('✅ Processing retry for payment method:', paymentMethod);

    // Handle different payment methods for retry
    switch (paymentMethod) {
      case 'upi':
        // Check if Razorpay order still exists
        if (transaction.gatewayDetails && transaction.gatewayDetails.razorpayOrderId) {
          console.log('✅ Using existing Razorpay order:', transaction.gatewayDetails.razorpayOrderId);
          return res.json({
            success: true,
            paymentMethod: 'upi',
            transactionId: transactionId,
            razorpayOrderId: transaction.gatewayDetails.razorpayOrderId,
            amount: transaction.amount * 100, // Convert to paise
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
          });
        } else {
          console.log('🔄 Creating new Razorpay order for retry');
          // Create new Razorpay order
          const razorpayOrderResult = await razorpayService.createOrder(
            transaction.amount,
            'INR',
            transactionId
          );

          if (!razorpayOrderResult.success) {
            console.log('❌ Failed to create Razorpay order:', razorpayOrderResult.error);
            throw new Error('Failed to create new Razorpay order for retry');
          }

          console.log('✅ New Razorpay order created:', razorpayOrderResult.order.id);

          // Update transaction with new gateway details
          await transactionService.updateTransactionGatewayDetails(transactionId, {
            razorpayOrderId: razorpayOrderResult.order.id,
            gatewayResponse: razorpayOrderResult
          });

          return res.json({
            success: true,
            paymentMethod: 'upi',
            transactionId: transactionId,
            razorpayOrderId: razorpayOrderResult.order.id,
            amount: razorpayOrderResult.order.amount,
            currency: razorpayOrderResult.order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
          });
        }

      case 'paypal':
        console.log('✅ PayPal retry - redirecting to checkout');
        return res.json({
          success: true,
          paymentMethod: 'paypal',
          transactionId: transactionId,
          redirectToCheckout: true
        });

      case 'wallet':
        console.log('✅ Wallet retry for amount:', transaction.amount);
        return res.json({
          success: true,
          paymentMethod: 'wallet',
          transactionId: transactionId,
          amount: transaction.amount
        });

      default:
        console.log('⚠️ Unknown payment method, redirecting to checkout:', paymentMethod);
        return res.json({
          success: true,
          paymentMethod: paymentMethod,
          transactionId: transactionId,
          redirectToCheckout: true
        });
    }

  } catch (error) {
    console.error('❌ Error initiating payment retry:', {
      error: error.message,
      stack: error.stack,
      transactionId: req.params.transactionId,
      userId: req.user ? req.user._id.toString() : 'undefined'
    });
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment retry: ' + error.message
    });
  }
};



// Retry wallet payment
exports.retryWalletPayment = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    console.log('🔄 Retrying wallet payment for transaction:', transactionId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get transaction details
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success || transactionResult.transaction.userId.toString() !== userId.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;
    const amount = transaction.amount;

    // Check wallet balance
    const walletBalance = await walletService.getWalletBalance(userId);
    if (!walletBalance.success || walletBalance.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        currentBalance: walletBalance.balance || 0,
        requiredAmount: amount
      });
    }

    // Process wallet payment
    const walletResult = await walletService.debitAmount(
      userId.toString(),
      amount,
      `Payment retry for transaction ${transactionId}`,
      null // No order ID yet
    );

    if (!walletResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Wallet payment failed: ' + walletResult.message
      });
    }

    // Create order from transaction data
    const orderData = transaction.orderData;
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);

    // Get delivery address
    const userAddresses = await Address.findOne({ userId });
    const addressIndex = userAddresses.address.findIndex(addr => 
      addr._id.toString() === orderData.deliveryAddressId.toString()
    );

    const newOrder = new Order({
      orderId: orderId,
      user: userId,
      items: orderData.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.COMPLETED
      })),
      deliveryAddress: {
        addressId: userAddresses._id,
        addressIndex: addressIndex
      },
      paymentMethod: 'wallet',
      subtotal: Math.round(orderData.pricing.subtotal || 0),
      totalDiscount: Math.round(orderData.pricing.totalDiscount || 0),
      amountAfterDiscount: Math.round(orderData.pricing.amountAfterDiscount || 0),
      shipping: orderData.pricing.shipping || 0,
      totalAmount: Math.round(orderData.pricing.total),
      totalItemCount: orderData.pricing.totalItemCount || 0,
      status: ORDER_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order placed via wallet (retry)'
      }]
    });

    await newOrder.save();

    // Update product stock
    for (const item of orderData.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variant) {
          variant.stock -= item.quantity;
          await product.save();
        }
      }
    }

    // Clear user's cart
    await Cart.updateOne({ userId }, { items: [] });

    // Update transaction status
    await transactionService.completeTransaction(transactionId, orderId, {
      walletTransactionId: walletResult.transactionId
    });

    console.log(`✅ Wallet retry successful: Order ${orderId} created for transaction ${transactionId}`);

    res.json({
      success: true,
      orderId: orderId,
      redirectUrl: `/checkout/order-success/${orderId}`,
      message: 'Wallet payment completed successfully'
    });

  } catch (error) {
    console.error('❌ Error retrying wallet payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry wallet payment: ' + error.message
    });
  }
};


module.exports = exports;
