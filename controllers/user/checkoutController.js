const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Order = require('../../models/Order');
const Coupon = require('../../models/Coupon');
const walletService = require('../../services/walletService');
const transactionService = require('../../services/transactionService');
const { paypalClient } = require('../../services/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const razorpayService = require('../../services/razorpay');
const crypto = require('crypto');


const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  getOrderStatusArray,
  getPaymentStatusArray,
  PAYMENT_METHODS
} = require('../../constants/orderEnums');

//  Not modified
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
        if ((product.category && (!product.category.isActive || product.category.isDeleted)) ||
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

//  Not modified
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

//  Not modified
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

// Helper functions
const calculateVariantFinalPrice = (product, variant) => {
  try {
    if (typeof product.calculateVariantFinalPrice === 'function') {
      return product.calculateVariantFinalPrice(variant);
    }
    return variant.basePrice || product.salePrice || product.regularPrice || 0;
  } catch (error) {
    console.error('Error calculating variant price:', error);
    return variant.basePrice || product.regularPrice || 0;
  }
}

const generateOrderId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}-${randomStr}`;
}


const validateProductAvailability = (product) => {
  if (!product || !product.isListed || product.isDeleted) {
    return { isValid: false, reason: 'Product is no longer available' };
  }

  if (product.category && (!product.category.isActive || product.category.isDeleted)) {
    return { isValid: false, reason: 'Product category is unavailable' };
  }

  if (product.brand && (!product.brand.isActive || product.brand.isDeleted)) {
    return { isValid: false, reason: 'Product brand is unavailable' };
  }

  return { isValid: true };
};

const validateVariantStock = (product, variantId, requestedQuantity) => {
  const variant = product.variants.find(v => v._id.toString() === variantId.toString());

  if (!variant) {
    return {
      isValid: false,
      reason: 'Product variant not found',
      availableStock: 0
    };
  }

  if (variant.stock === 0) {
    return {
      isValid: false,
      reason: 'Out of stock',
      availableStock: 0
    };
  }

  if (variant.stock < requestedQuantity) {
    return {
      isValid: false,
      reason: `Only ${variant.stock} items available`,
      availableStock: variant.stock
    };
  }

  return {
    isValid: true,
    variant,
    availableStock: variant.stock
  };
}

const restoreStock = async (orderItems) => {
  try {
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (product && item.variantId) {
        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variant) {
          variant.stock += item.quantity;
          await product.save();
          console.log(`Stock restored: ${item.quantity} units for product ${product.productName}`);
        }
      }
    }
  } catch (error) {
    console.error('Error restoring stock!: ', error);
  }
};

const deductStock = async (orderItems) => {
  const deductedItems = [];

  try {
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());

      if (!variant) {
        throw new Error(`Variant not found for product: ${product.productName}`);
      }

      if (variant.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.productName} (Size: ${item.size})`);
      }

      variant.stock -= item.quantity;
      await product.save();

      deductedItems.push(item);
      console.log(`Stock deducted: ${item.quantity} units from ${product.productName}`);
    }

    return true;
  } catch (error) {
    console.error('Error deducting stock, rolling back:', error);

    // restore stock for items that were already deducted
    if (deductedItems.length > 0) {
      await restoreStock(deductedItems);
    }

    throw error;
  }
};

// 1. validate checkout stock 
const validateCheckoutStock = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const cart = await Cart.findOne( { userId } )
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isListed isDeleted categoryOffer' },
          { path: 'brand', select: 'name isActive isDeleted brandOffer' }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
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

    // validate each cart item
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

      //validate product availability
      const availabilityCheck = validateProductAvailability(item.productId);
      console.log(`Product Availability Check: ${availabilityCheck}`);

      if (!availabilityCheck.isValid) {
        validationResults.unavailableItems.push({
          ...itemData,
          reason: availabilityCheck.reason
        });
        continue;
      }

      

      // validate variant and stock
      const stockCheck = validateVariantStock(item.productId, item.variantId, item.quantity);
      console.log(`Product Stock Check: ${astockCheck}`);
      if (!stockCheck.isValid) {
        if (stockCheck.availableStock === 0) {
          validationResults.outOfStockItems.push({
            ...itemData,
            reason: stockCheck.reason,
            availableStock: 0
          });
        } else {
          validationResults.outOfStockItems.push({
            ...itemData,
            reason: stockCheck.reason,
            availableStock: stockCheck.availableStock,
            requestedQuantity: item.quantity
          });
          continue;
        }

        // when item is valid
        validationResults.validItems.push({
          ...itemData,
          availableStock: stockCheck.availableStock
        });
      }

      // check checkout eligible items
      if (validationResults.validItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No items in your cart are available for checkout',
          code: 'NO_CHECKOUT_ITEMS',
          validationResults
        });
      }
    }

      return res.json({
        success: true,
        message: validationResults.validItems.length === cart.items.length
        ? 'All cart items are available for checkout'
        : 'Some items are unavailable but checkout can be processed',
        validationResults,
        totalValidItems: validationResults.validItems.length,
        totalItems: cart.items.length
      });

  } catch (error) {
    console.error('Error validating checkout stock:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate cart for checkout',
      code: 'VALIDATION_ERROR'
    });
  }
};

// 2. place order
const placeOrder = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    // validate authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication Required'
      });
    }

    // validate fields
    if (!deliveryAddressId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required'
      });
    }

    // validate payment method
    const validatePaymentMethods = Object.values(PAYMENT_METHODS);
    if (!validatePaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    console.log(`Processing order for user ${userId} with payment method: ${paymentMethod}`);

    // switching to appropriate order handler
    switch (paymentMethod) {
      case PAYMENT_METHODS.COD:
        return await handleCODOrder(req, res);

      case PAYMENT_METHODS.WALLET:
        return await handleWalletOrder(req, res);

      case PAYMENT_METHODS.UPI:
      case PAYMENT_METHODS.PAYPAL:
        return await createTransactionForPayment(req, res);

      default:
        return res.status(400).json({
          success: false,
          message: 'Payment method not supported'
        });
    }

  } catch (error) {
    console.error('Error in placeOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: error.message
    });
  }
}

// 3. place order with validation
const placeOrderWithValidation = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // fetch and validate cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isListed isDeleted categoryOffer' },
          { path: 'brand', select: 'name isActive isDeleted brandOffer' }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    // validate all items
    const stockIssues = [];

    for (const item of cart.items) {
      const productName = item.productId?.productName || 'Unknown Product';

      // check product availability
      const availabilityCheck = validateProductAvailability(item.productId);
      if (!availabilityCheck.isValid) {
        stockIssues.push({
          productName,
          size: item.size,
          quantity: item.quantity,
          error: availabilityCheck.reason
        });
        continue;
      }

      // check variant stock
      if (item.variantId) {
        const stockCheck = validateVariantStock(item.productId, item.variantId, item.quantity);
        if (!stockCheck.isValid) {
          stockIssues.push({
            productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: stockCheck.availableStock,
            error: stockCheck.reason
          });
        }
      }
    }

    // return detailed error if validation fails
    if (stockIssues.length > 0) {
      const errorMessages = stockIssues.map((issue, index) => 
        `${index + 1}. ${issue.productName} (Size: ${issue.size} \n ${issue.error})`
      );

      return res.status(400).json({
        success: false,
        message: 'Some items in your cart have stock issues:\n\n' + errorMessages.join('\n\n') + '\n\nPlease update your cart before proceeding.',
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    return await placeOrder(req, res);

  } catch (error) {
    console.error('Error in placeOrderWithValidation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate and place order',
      code: 'VALIDATION_ERROR'
    });
  }
};

// order handlers
// handle cod order
const handleCODOrder = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId } = req.body;

    // create transaction and order
    const result = await createOrderWithTransaction(userId, deliveryAddressId, PAYMENT_METHODS.COD, req);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const order = result.order;
    const transaction = result.transaction;

    order.status = ORDER_STATUS.PROCESSING;
    order.paymentStatus = PAYMENT_STATUS.PENDING;
    order.statusHistory.push({
      status: ORDER_STATUS.PENDING,
      updatedAt: new Date(),
      notes: 'Order placed with Cash on Delivery'
    });

    order.items.forEach(item => {
      item.status = ORDER_STATUS.PENDING;
      item.paymentStatus = PAYMENT_STATUS.PENDING;
    });

    await order.save();

    await transactionService.updateTransactionStatus(
      transaction.transactionId,
      'PROCESSING',
      'COD order placed, payment pending until delivery'
    );

    // handle coupon usage
    if (req.session.appliedCoupon) {
      const { updateCouponUsage } = require('./couponController');
      await updateCouponUsage(req.session.appliedCoupon._id, userId, order._id);
      delete req.session.appliedCoupon;
    }

    // clear cart
    await Cart.findOneAndUpdate({userId}, { $set: { items: [] } });

    console.log(`COD order places successfully: ${order.orderId}`);

    return res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
      transactionId: transaction.transactionId,
      redirectUrl: `/checkout/order-success/${order.orderId}`,
      paymentMethod: PAYMENT_METHODS.COD
    });

  } catch (error) {
    console.error('Error handling COD order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to place COD order',
      error: error.message
    });
  }
};

const handleWalletOrder = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId } = req.body;

    const result = await createOrderWithTransaction(userId, deliveryAddressId, PAYMENT_METHODS.WALLET, req);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const order = result.order;
    const transaction = result.transaction;

    try {
      console.log(`Processing wallet payment for order: ${order.orderId}`);

      await transactionService.updateTransactionStatus(
        transaction.transactionId,
        'PROCESSING',
        'Processing wallet payment'
      );
      
      const walletResult = await walletService.debitAmount(
        userId.toString(),
        order.totalAmount,
        `Payment for order ${order.orderId}`,
        order.orderId
      );

      if (!walletResult.success) {
        order.status = ORDER_STATUS.PENDING;
        order.paymentStatus = PAYMENT_STATUS.FAILED;
        order.statusHistory.push({
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
          notes: `Wallet payment failed: ${walletResult.message}`
        });

        order.items.forEach(item => {
          item.status = ORDER_STATUS.PENDING;
          item.paymentStatus = PAYMENT_STATUS.FAILED;
        });

        await order.save();
        await restoreStock(order.items);

        await transactionService.failTransaction(
          transaction.transactionId,
          walletResult.message || 'Insufficient wallet balance',
          'WALLET_INSUFFICIENT_BALANCE'
        );

        console.log(`Wallet payment failed for order: ${order.orderId}, stock restored`);

        return res.status(400).json({
          success: false,
          message: walletResult.message,
          error: 'WALLET_PAYMENT_FAILED',
          orderId: order.orderId,
          redirectUrl: `/checkout/order-failure/${order.orderId}`
        });
      }

      // if payment is successful
      order.status = ORDER_STATUS.PROCESSING;
      order.paymentStatus = PAYMENT_STATUS.COMPLETED;
      order.statusHistory.push({
        status: ORDER_STATUS.PROCESSING,
        updatedAt: new Date(),
        notes: 'Payment completed via wallet'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PROCESSING;
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      });

      await order.save();

      await transactionService.completeTransaction(
        transaction.transactionId,
        order.orderId,
        { walletTransactionId: walletResult.transactionId }
      );

      if (req.session.appliedCoupon) {
        const { updateCouponUsage } = require('./couponController');
        await updateCouponUsage(req.session.appliedCoupon._id, userId, order._id);
        delete req.session.appliedCoupon;
      }

      // clear cart
      await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

      console.log(`Wallet payment successful for order: ${order.orderId}`);

      return res.json({
        success: true,
        message: 'Order placed successfully! Payment completed via Wallet',
        orderId: order.orderId,
        transactionId: transaction.transactionId,
        redirectUrl: `/checkout/order-success/${order.orderId}`,
        paymentMethod: PAYMENT_METHODS.WALLET,
        totalAmount: order.totalAmount
      });

    } catch (walletError) {
      console.error('Wallet payment error:', walletError);

      order.status = ORDER_STATUS.PENDING;
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Payment processing error'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PENDING;
        item.paymentStatus = PAYMENT_STATUS.FAILED;
      });

      await order.save();
      await restoreStock(order.items);

      await transactionService.failTransaction(
        transaction.transactionId,
        'Wallet payment processing error',
        'WALLET_PROCESSING_ERROR'
      );

      return res.status(500).json({
        success: false,
        message: 'Wallet payment processing failed',
        error: walletError.message,
        orderId: order.orderId,
        transactionId: transaction.transactionId,
        redirectUrl: `/checkout/order-failure/${order.orderId}`
      });
    }

  } catch (error) {
    console.error('Error handling wallet order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process wallet order',
      error: error.message
    });
  }
};

// helper: creating order with transaction - used by cod and wallet orders
const createOrderWithTransaction = async (userId, deliveryAddressId, paymentMethod, req) => {
  try {
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isListed isDeleted categoryOffer' },
          { path: 'brand', select: 'name isActive isDeleted brandOffer' }
        ]
      });

      if (!cart || !cart.items || cart.items.length === 0) {
        return {
          success: false,
          message: 'Cart is empty',
        };
      }

      // validate and prepare order items
      const validItems = [];
      const cartItemsForTransaction = [];
      let subtotal = 0;
      let totalDiscount = 0;
      let totalItemCount = 0;

      for (const item of cart.items) {
        const availabilityCheck = validateProductAvailability(item.productId);
        if (!availabilityCheck.isValid) continue;

        const stockCheck = validateVariantStock(item.productId, item.variantId, item.quantity);
        if (!stockCheck.isValid) continue;

        // calculate prices
        const variant = stockCheck.variant;
        const regularPrice = item.productId.regularPrice;
        const salePrice = calculateVariantFinalPrice(item.productId, variant);
        const quantity = item.quantity;

        subtotal += regularPrice * quantity;
        totalItemCount += quantity;
        totalDiscount += (regularPrice - salePrice) * quantity;

        validItems.push({
          productId: item.productId._id,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: quantity,
          price: salePrice,
          totalPrice: salePrice * quantity,
          status: ORDER_STATUS.PENDING,
          paymentStatus: PAYMENT_STATUS.PENDING,
          statusHistory: [{
            status: ORDER_STATUS.PENDING,
            updatedAt: new Date(),
            notes: 'Order Created'
          }]
        });

        // prepare cart items for transaction
        cartItemsForTransaction.push({
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

      if (validItems.length === 0) {
        return {
          success: false,
          message: 'No valid items in cart'
        };
      }

      // apply coupon if exists
      let couponDiscount = 0;
      let couponApplied = null;
      if (req.session?.appliedCoupon) {
        couponDiscount = req.session.appliedCoupon.discountAmount || 0;
        couponApplied = req.session.appliedCoupon._id;
        totalDiscount += couponDiscount;
      }

      // calculateTotals
      const amountAfterDiscount = subtotal - totalDiscount;
      const shipping = amountAfterDiscount >= 500 ? 0 : 50;
      const totalAmount = amountAfterDiscount + shipping;

      // validate address
      const addressDoc = await Address.findOne({ userId });
      if (!addressDoc || !addressDoc.address) {
        return {
          success: false,
          message: 'No delivery address found'
        };
      }

      const deliveryAddress = addressDoc.address.id(deliveryAddressId);
      if (!deliveryAddress) {
        return {
          success: false,
          message: 'Invalid delivery address'
        };
      }

      const addressIndex = addressDoc.address.findIndex(
        addr => addr._id.toString() === deliveryAddressId.toString()
      );


      // create order id
      const orderId = generateOrderId();

      const transactionResult = await transactionService.createOrderTransaction({
        userId: userId,
        paymentMethod: paymentMethod,
        deliveryAddressId: deliveryAddressId,
        amount: totalAmount,
        orderId: orderId,
        cartItems: cartItemsForTransaction,
        pricing: {
          subtotal: subtotal,
          totalDiscount: totalDiscount,
          amountAfterDiscount: amountAfterDiscount,
          shipping: shipping,
          total: totalAmount,
          totalItemCount: totalItemCount
        },
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        sessionId: req.sessionID
      });

      if (!transactionResult.success) {
        return {
          success: false,
          message: 'Failed to create transaction',
          error: transactionResult.error
        };
      }

      const transaction = transactionResult.transaction;
      console.log(`Trancation created: ${transaction.transactionId}`);

      try {
        await deductStock(validItems);
      } catch (stockError) {
        // if stock deduction fails, mark transaction as failed
        await transactionService.failTransaction(
          transaction.transactionId,
          'Stock deduction failed',
          'INSUFFICIENT_STOCK'
        );

        return {
          success: false,
          message: 'Failed to deduct stock',
          error: stockError.message
        };
      }

      // create order
      const order = new Order({
        orderId,
        orderDocumentId: null,
        user: userId,
        items: validItems,
        deliveryAddress: {
          addressId: addressDoc._id,
          addressIndex: addressIndex
        },
        couponApplied,
        couponDiscount,
        paymentMethod,
        paymentStatus: PAYMENT_STATUS.PENDING,
        subtotal,
        totalDiscount,
        amountAfterDiscount,
        shipping,
        totalAmount,
        totalItemCount,
        status: ORDER_STATUS.PENDING,
        statusHistory: [{
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
          notes: 'Order created'
        }]
      });

      await order.save();

      order.orderDocumentId = order._id;
      await order.save();

      transaction.orderDocumentId = order._id;
      await transaction.save();

      console.log(`Order created successfully: ${orderId} (Transaction: ${transaction.transactionId})`);

      return {
        success: true,
        order,
        transaction,
        orderId
      };

  } catch (error) {
    console.error('Error creating order:', error);
    return {
      success: false,
      message: 'Failed to create order',
      error: error.message
    };
  }
};


// 4. create transaction for payment for upi/paypal
const createTransactionForPayment = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    console.log(`Creating transaction for payment: ${paymentMethod}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Delivery address and payment method are required'
      });
    }

    // create order with transaction
    const orderResult = await createOrderWithTransaction(userId, deliveryAddressId, paymentMethod, req);

    if (!orderResult.success) {
      return res.status(400).json(orderResult);
    }

    const order = orderResult.order;
    const transaction = orderResult.transaction;

    console.log(`Order and transaction created: ${order.orderId}, ${transaction.transactionId}`);

    return res.json({
      success: true,
      message: 'Transaction created successfully',
      orderId: order.orderId,
      transactionId: transaction.transactionId,
      amount: order.totalAmount,
      paymentMethod
    });

  } catch (error) {
    console.error('Error creating transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    });
  }
};

// 5. create paypal order
const createPayPalOrder = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user?._id || req.session?.userId;

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

    const transaction = transactionResult.transaction;

    // verify ownership
    const transactionUserId = transactionUserId?._id?.toString() ||transaction.userId.toString();
    if (transactionUserId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized Access'
      });
    }

    // create paypal order
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representaion');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: transaction.orderId,
        description: `Order ${transaction.orderId}`,
        amount: {
          currency_code: 'USD',
          value: ( transaction.amount / 83).toFixed(2)
        }
      }],
      application_context: {
        brand_name: 'LacedUp',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${process.env.BASE_URL}/checkout/paypal-success`,
        cancel_url: `${process.env.BASE_URL}/checkout/paypal-cancel`
      }
    });

    const paypalOrder = await paypalClient().execute(request);

    await transactionService.updateTransactionGatewayDetails(transactionId, {
      paypalOrderId: paypalOrder.result.id,
      gatewayResponse: paypalOrder.result
    });

    console.log(`PayPal order created: ${paypalOrderId.result.id}`);

    return res.json({
      success: true,
      orderId: paypalOrder.result.id,
      transactionId
    });


  } catch (error) {
    console.error('Error creating PayPal order:', error);

    if (req.body.transactionId) {
      await transactionService.failTransaction(
        req.body.transactionId,
        'PayPal order creation failed',
        'PAYPAL_ORDER_CREATION_FAILED'
      );
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create PayPal order',
      error: error.message
    });
  }
};

// capture paypal order
const capturePayPalOrder = async (req, res) => {
  try {
    const { orderID, transactionId } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication Required'
      });
    }

    if (!orderID || transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and Transaction ID are required'
      });
    }

    console.log(`Creating PayPal order: ${orderID}`);

    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    const order = await Order.findOne({
      $or: [
        { orderId: transaction.orderId },
        { _id: transaction.orderDocumentId }
      ],
      user: userId
    });

    if (!order) {
      return res.status(400).json({
        success: true,
        message: 'Order not found'
      });
    }

    // capture paypal payment
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    try {
      const capture = await paypalClient().execute(request);

      if (capture.result.status === 'COMPLETED') {
        // payment success
        order.status = ORDER_STATUS.PROCESSING;
        order.paymentStatus = PAYMENT_STATUS.COMPLETED;
        order.paypalCaptureId = capture.result.id;
        order.statusHistory.push({
          status: ORDER_STATUS.PROCESSING,
          updatedAt: new Date(),
          notes: 'Payment completed via PayPal'
        });

        order.items.forEach(item => {
          item.status = ORDER_STATUS.PROCESSING;
          item.paymentStatus = PAYMENT_STATUS.COMPLETED;
        });

        await order.save();

        await transactionService.completeTransaction(transactionId, order.orderId, {
          paypalCaptureId: capture.result.id
        });

        if (req.session.appliedCoupon) {
          const { updateCouponUsage } = require('./couponController');
          await updateCouponUsage(req.session.appliedCoupon._id, userId, order._id);
          delete req.session.appliedCoupon
        }

        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        console.log(`PayPal payment captured successfully: ${order.orderId}`);

        return res.json({
          success: true,
          message: 'Payment completed successfully',
          orderId: order.orderId,
          transactionId,
          redirectUrl: `/checkout/order-success/${order.orderId}`
        });

      } else {
        throw new Error(`PayPal capture failed with status: ${capture.result.status}`);
      }

    } catch (captureError) {
      console.error('PayPal capture error:', captureError);

      order.status = ORDER_STATUS.PENDING;
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'PayPal payment capture failed'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PENDING;
        item.paymentStatus = PAYMENT_STATUS.FAILED
      });

      await order.save();
      await restoreStock(order.items);

      await transactionService.failTransaction(
        transactionId,
        'PayPal capture failed',
        'PAYPAL_CAPTURE_FAILED'
      );

      console.log(`PayPal payment failed for order: ${order.orderId}, stock restored`);

      return res.status(400).json({
        success: false,
        message: 'Payment capture failed',
        orderId: order.orderId,
        transactionId,
        redirectUrl: `/checkout/order-failure/${order.orderId}`
      });
    }

  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to capture PayPal payment',
      error: error.message
    });
  }
};


// 7. create razorpay order
const createRazorpayOrder = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (userId) {
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

    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    const transactionUserId = transaction.userId?._id?.toString() || transaction.userId.toString();
    if (transactionUserId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const razorpayOrderData = {
      amount: Math.round(transaction.amount * 100),
      currency: 'INR',
      receipt: transaction.orderId,
      notes: {
        orderId: transaction.orderId,
        transactionId: transaction.transactionId,
        userId: userId.toString()
      }
    };

    const razorpayOrder = await razorpayService.createOrder(razorpayOrderData);

    if (!razorpayOrder || !razorpayOrder.id) {
      throw new Error('Failed to create Razorpay order');
    }

    await transactionService.updateTransactionGatewayDetails(transactionId, {
      razorpayOrderId: razorpayOrder.id,
      gatewayResponse: razorpayOrder
    });

    console.log(`Razorpay order created: ${razorpayOrder.id}`);

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: transaction.amount,
      currency: 'INR',
      transactionId,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);

    if (req.body.transactionId) {
      await transactionService.failTransaction(
        req.body.transactionId,
        'Razorpay order creation failed',
        'RAZORPAY_ORDER_CREATION_FAILED'
      );
    }

    return res.status(500).json({
      success: true,
      message: 'Failed to create Razorpay order',
      error: error.message
    });
  }
}

// 8. verify razorpay payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, transactionId } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    console.log(`Verifying Razorpay payment: ${razorpay_payment_id}`);

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment parameters'
      });
    }

    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    const order = await Order.findOne({
      $or: [
        { orderId: transaction.orderId },
        { _id: transaction.orderDocumentId }
      ],
      user: userId
    });

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order not found'
      });
    }

    // verify signature
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    );

    if (isValidSignature) {
      console.log('Payment signature verified successfully');

      // payment success
      order.status = ORDER_STATUS.PROCESSING;
      order.paymentStatus = PAYMENT_STATUS.COMPLETED;
      order.razorpayOrderId = razorpay_order_id;
      order.razorpayPaymentId = razorpay_payment_id;
      order.statusHistory.push({
        status: ORDER_STATUS.PROCESSING,
        updatedAt: new Date(),
        notes: 'Payment completed via UPI (Razorpay)'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PROCESSING;
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      });

      await order.save();

      await transactionService.completeTransaction(transactionId, order.orderId, {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature
      });

      if (req.session.appliedCoupon) {
        const { updateCouponUsage } = require('./couponController');
        await updateCouponUsage(req.session.appliedCoupon._id, userId, order._id);
        delete req.session.appliedCoupon;
      }

      await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

      console.log(`Order payment completed: ${order.orderId}`);

      return res.json({
        success: true,
        message: 'Payment verified and order updated successfully',
        orderId: order.orderId,
        transactionId,
        redirectUrl: `/checkout/order-success/${order.orderId}`
      });

    } else {
      console.log('Invalid payment signature');

      order.status = ORDER_STATUS.PENDING;
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Payment verification failed - invalid signature'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PENDING;
        item.paymentStatus = PAYMENT_STATUS.FAILED;
      });

      await order.save();
      await restoreStock(order.items);

      await transactionService.failTransaction(
        transactionId,
        'Payment signature verification failed',
        'RAZORPAY_SIGNATURE_INVALID'
      );

      console.log(`Payment verification failed for order: ${order.orderId}, stock restored`);

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        orderId: order.orderId,
        transactionId,
        redirectUrl: `/checkout/order-failure/${order.orderId}`
      });
    }

  } catch (error) {
    console.error('Razorpay verification error:', error);

    if (req.body.transactionId) {
      try {
        const transactionResult = await transactionService.getTransaction(re.body.transactionId);
        if (transactionResult.success && transactionResult.transaction.orderId) {
          const order = await Order.findOne({ orderId: transactionResult.transaction.orderId });
          if (order) {
            order.status = ORDER_STATUS.PENDING;
            order.paymentStatus = PAYMENT_STATUS.FAILED;
            order.statusHistory.push({
              status: ORDER_STATUS.PENDING,
              updatedAt: new Date(),
              notes: 'Payment verification failed - system error'
            });

            order.items.forEach(item => {
              item.status = ORDER_STATUS.PENDING;
              item.paymentStatus = PAYMENT_STATUS.FAILED;
            });

            await order.save();
            await restoreStock(order.items);

            await transactionService.failTransaction(
              req.body.transactionId,
              'Payment verification system error',
              'SYSTEM_ERROR'
            );

            return res.status(500).json({
              success: false,
              message: 'Payment verification failed due to system error',
              orderId: order.orderId,
              transactionId: req.body.transactionId,
              redirectUrl: `/checkout/order-failure/${order.orderId}`
            });
          }
        }
      } catch (updateError) {
        console.error('Error updating order after system error:', updateError);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Payment verification failed due to system error',
      error: error.message
    });
  }
};


// 9. handle payment failure
const handlePaymentFailure = async (req, res) => {
  try {
    const { transactionId, orderId, reason } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    if (!transactionId && !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID or Order ID is required'
      });
    }

    console.log(`Handling payment failure for transaction: ${transactionId}`);

    let transaction = null;
    let order = null;

    // get transaction if provided
    if (transactionId) {
      const transactionResult = await transactionService.getTransaction(transactionId);
      if (transactionResult.success) {
        transaction = transactionResult.transaction;
      }

      await transactionService.failTransaction(
        transactionId,
        reason || 'Payment Failed',
        'USER_CANCELLED_OR_FAILED'
      );
    }

    if (orderId) {
      order = await Order.findOne({
        $or: [
          { orderId: orderId },
          { _id: orderId }
        ]
      });
    } else if (transaction) {
      order = await Order.findOne({
        $or: [
          { orderId: transaction.orderId },
          { _id: transaction.orderDocumentId }
        ]
      });
    }

    if (order) {
      order.status = ORDER_STATUS.PENDING;
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: `Payment failed: ${reason || 'Unknown reason'}`
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PENDING;
        item.paymentStatus = PAYMENT_STATUS.FAILED;
      });

      await order.save();
      await restoreStock(order.items);
      console.log(`Order marked as payment failed: ${order.orderId}, stock restored`);
    }

    // restore cart 
    if (transaction && transaction.orderData && transaction.orderData.items) {
      const cart = await Cart.findOne({ userId } || new Cart({ userId, items: [] }));

      for (const originalItem of transaction.orderData.items) {
        try {
          const product = (await Product.findById(originalItem.productId)).populated(['category', 'brand']);

          if (!product || !product.isListed || product.isDeleted) continue;
          if (product.category && (!product.category.isActive || product.category.isDeleted)) continue;
          if (product.brand && (!product.brand.isActive || product.brand.isDeleted)) continue;

          const variant = product.variants.find(v => v._id.toString() === originalItem.variantId.toString());
          if (!variant || variant.stock === 0) continue;

          const existingItemIndex = cart.items.findIndex(
            item => item.productId.toString === originalItem.productId.toString() &&
            item.variantId.toString() === originalItem.variantId.toString()
          );

          if (existingItemIndex > -1) {
            const currentQty = cart.items[existingItemIndex].quantity;
            const newQty = Math.min(currentQty + originalItem.quantity, variant.stock, 5);
            cart.items[existingItemIndex].quantity = newQty;
            cart.items[existingItemIndex].totalPrice = cart.items[existingItemIndex].price * newQty;
          } else {
            const quantityToAdd = Math.min(originalItem.quantity, variant.stock, 5);
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
          }

        } catch (itemError) {
          console.error('Error restoring cart item: ', itemError);
        }
      }

      await cart.save();
      console.log('Cart items restored after payment failure');
    }

    return res.json({
      success: true,
      message: 'Payment failure handled, cart items restored',
      orderId: order?.orderId,
      transactionId,
      redirectUrl: `/checkout/order-failure/${order?.orderId || transactionId}`
    });

  } catch (error) {
    console.error('Error handling payment failure', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to handle payment failure',
      error: error.message
    });
  }
};


// 10. retry payment
const retryPayment = async (req, res) => {
  try {
    const { transactionId, paymentMethod } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User Authentication Required'
      });
    }

    if (!transactionId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID and Payment Method are required'
      });
    }

    console.log(`Retrying payment for transaction: ${transactionId}`);

    const transactionResult = await transactionService.getTransaction(trnsactionId);

    if (!transactionResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = transactionResult.transaction;

    const transactionUserId = transaction.userId?._id?.toString() || transaction.userId.toString();
    if (transactionUserId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    if (!['FAILED', 'CANCELLED'].includes(transaction.status)) {
      return res.status(400).json({
        success: false,
        message: 'This transaction cannot be retried'
      });
    }

    // validate stock availability before retry
    if (transaction.orderData && transaction.orderData.items) {
      const stockIssues = [];

      for (const item of transaction.orderData.items) {
        const product = (await Product.findById(item.productId)).populated(['category', 'brand']);

        const availabilityCheck = validateProductAvailability(product);
        if (!availabilityCheck.isValid) {
          stockIssues.push({
            productName: product?.productName || 'Unknown Product',
            issue: availabilityCheck.reason
          });
          continue;
        }

        const stockCheck = validateVariantStock(product, item.variantId, item.quantity);
        if (!stockCheck.isValid) {
          stockIssues.push({
            productName: product.productName,
            issue: stockCheck.reason
          });
        }
      }

      if (stockIssues.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some items are no longer available',
          stockIssues
        });
      }
    }

    // update transaction status to retry
    await transactionService.updateTransactionStatus(
      transactionId,
      'PENDING',
      'Payment retry initiated'
    );

    const order = await Order.findOne({
      $or: [
        { orderId: transaction.orderId }, { _id: transaction.orderDocumentId }
      ]
    });

    if (order) {
      order.paymentStatus = PAYMENT_STATUS.PENDING;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Payment retry initiated'
      });

      order.items.forEach(item => {
        item.paymentStatus = PAYMENT_STATUS.PENDING;
      });

      await order.save();
    }

    console.log (`Payment retry initiated for transaction: ${transactionId}`);

    return res.json({
      success: true,
      message: 'Payment retry initiated',
      transactionId,
      paymentMethod
    });

  } catch (error) {
    console.error(`Error retrying payment:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry payment',
      error: error.message
    });
  }
};


// 11. retry wallet payment
const retryWalletPayment = async (req, res) => {
  try {
    const { transactionId, orderId } = req.body;
    const userId = req.user?._id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!transactionId && !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID and Order ID is required'
      });
    }

    console.log(`Retrying wallet payment for transaction: ${transactionId}`);

    let order = null;
    let transaction = null;

    if (transactionId) {
      const transactionResult = await transactionService.getTransaction(transactionId);
      if (transactionResult.success) {
        transaction = transactionResult.transaction;
      }
    }

    if (orderId) {
      order = await Order.findOne({
        $or: [
          { orderId: transaction.orderId },
          { _id: transaction.orderDocumentId }
        ]
      });
    }

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order not found'
      });
    }

    // check if order can be retried
    if (order.status !== ORDER_STATUS.PENDING || order.paymentStatus !== PAYMENT_STATUS.FAILED) {
      return res.status(400).json({
        success: false,
        message: 'This order cannot be retried'
      });
    }

    // validate stock before processing payment
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      
      const availabilityCheck = validateProductAvailability(product);
      if (!availabilityCheck.isValid) {
        return res.status(400).json({
          success: false,
          message: `${product.productName || 'Product'} is no longer available`
        });
      }

      const stockCheck = validateVariantStock(product, item.variantId, item.quantity);
      if (!stockCheck.isValid) {
        return res.status(400).json({
          success: false,
          message: `${product.productName}: ${stockCheck.reason}`
        });
      }
    }

    try {
      await deductStock(order.items);

      if (transactionId) {
        await transactionService.updateTransactionStatus(
          transactionId,
          'PROCESSING',
          'Processing wallet payment retry'
        );
      }

      // wallet deduction
      const walletResult = await walletService.debitAmount(
        userId.toString(),
        order.orderAmount,
        `Payment for order ${order.orderId} (Retry)`,
        order.orderId
      );

      if (!walletResult.success) {
        order.status = ORDER_STATUS.PENDING;
        order.paymentStatus = PAYMENT_STATUS.FAILED;
        order.statusHistory.push({
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
          notes: `Wallet payment retry failed: ${walletResult.message}`,
        });

        order.items.forEach(item => {
          item.status = ORDER_STATUS.PENDING;
          item.paymentStatus = PAYMENT_STATUS.FAILED;
        });

        await order.save();
        await restoreStock(order.items);

        if (transactionId) {
          await transactionService.failTransaction(
            transactionId,
            walletResult.message || 'Insufficient wallet balance',
            'WALLET_INSUFFICIENT_BALANCE'
          );
        }

        console.log(`Wallet payment retry failed for order: ${order.orderId}, stock restored`);

        return res.status(400).json({
          success: false,
          message: walletResult.message || 'Insufficient Wallet Balance',
          orderId: order.orderId,
          transactionId,
          redirectUrl: `/checkout/order-failure/${order.orderId}`
        });
      }

      // payment success case
      order.status = ORDER_STATUS.PROCESSING;
      order.paymentStatus = PAYMENT_STATUS.COMPLETED;
      order.paymentMethod = PAYMENT_METHODS.WALLET;
      order.statusHistory.push({
        status: ORDER_STATUS.PROCESSING,
        updatedAt: new Date(),
        notes: 'Payment completed via wallet (Retry)'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PROCESSING;
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      });

      await order.save();

      if (transactionId) {
        await transactionService.completeTransaction(transactionId, order.orderId, {
          paymentMethod: PAYMENT_METHODS.WALLET,
          walletTransactionId: walletResult.transactionId
        });
      }

      if (req.session.appliedCoupon) {
        const { updateCouponUsage } = require('./couponController');
        await updateCouponUsage(req.session.appliedCoupon._id, userId, order._id);
        delete req.session.appliedCoupon;
      }

      await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

      console.log(`Wallet payment retry successful: ${order.orderId}`);

      return res.json({
        success: true,
        message: 'Payment completed successfully via wallet',
        orderId: order.orderId,
        transactionId,
        redirectUrl: `/checkout/order-success/${order.orderId}`
      });

    } catch (walletError) {
      console.error('Wallet payment retry error:', walletError);

      order.status = ORDER_STATUS.PENDING;
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.statusHistory.push({
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Wallet payment retry failed - system error'
      });

      order.items.forEach(item => {
        item.status = ORDER_STATUS.PENDING;
        item.paymentStatus = PAYMENT_STATUS.FAILED;
      });

      await order.save();

      if (transactionId) {
        await transactionService.failTransaction(
          transactionId,
          'Wallet payment processing error',
          'WALLET_PROCESSING_ERROR'
        );
      }

      return res.status(500).json({
        success: false,
        message: 'Wallet payment processing failed',
        error: walletError.message,
        orderId: order.orderId,
        transactionId,
        redirectUrl: `/checkout/order-failure/${order.orderId}`
      });
    }


  } catch (error) {
    console.error('Error retrying wallet payment: ', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retry wallet payment',
      error: error.message
    });
  }
};



// Not modified
const loadCheckout = async (req, res) => {
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

// not modified
const loadOrderSuccess = async (req, res) => {
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

// not modified
const loadOrderFailure = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const user = req.user || { fullname: 'User' };
    
    const transactionId = req.params.transactionId || req.query.transactionId;
    let orderData = null;
    
    if (transactionId) {
      try {
        const transactionService = require('../../services/transactionService');
        const transactionResult = await transactionService.getTransaction(transactionId);
        
        if (transactionResult.success && transactionResult.transaction) {
          const transaction = transactionResult.transaction;
          
          // Get delivery address from transaction data
          let actualDeliveryAddress = null;
          if (transaction.orderData && transaction.orderData.deliveryAddressId) {
            const userAddresses = await Address.findOne({ userId });
            if (userAddresses && userAddresses.address) {
              const address = userAddresses.address.find(addr => 
                addr._id.toString() === transaction.orderData.deliveryAddressId.toString()
              );
              if (address) {
                actualDeliveryAddress = address;
              }
            }
          }

          // ✅ FIXED: Populate product data for each item
          const itemsWithProducts = [];
          if (transaction.orderData.items && transaction.orderData.items.length > 0) {
            for (const item of transaction.orderData.items) {
              try {
                // ✅ DEBUG: Log the original item structure
                console.log('🔍 Original transaction item:', JSON.stringify(item, null, 2));
                
                // Populate product data
                const product = await Product.findById(item.productId)
                  .select('productName mainImage subImages regularPrice salePrice')
                  .lean();

                // ✅ FIXED: Calculate price from available sources
                const itemPrice = item.price || item.unitPrice || product?.salePrice || product?.regularPrice || 0;
                const itemQuantity = item.quantity || 1;
                const itemTotalPrice = item.totalPrice || (itemPrice * itemQuantity);

                const populatedItem = {
                  ...item,
                  // ✅ Ensure all price fields are set
                  price: itemPrice,
                  quantity: itemQuantity,
                  totalPrice: itemTotalPrice,
                  size: item.size || 'N/A',
                  sku: item.sku || 'N/A',
                  productId: product ? {
                    _id: product._id,
                    productName: product.productName || 'Product Name',
                    mainImage: product.mainImage || null,
                    subImages: product.subImages || []
                  } : {
                    _id: item.productId,
                    productName: 'Product Name',
                    mainImage: null,
                    subImages: []
                  }
                };

                // ✅ DEBUG: Log the final populated item
                console.log('✅ Final populated item:', JSON.stringify(populatedItem, null, 2));
                itemsWithProducts.push(populatedItem);
              } catch (productError) {
                console.error('Error populating product for item:', productError);
                // Add item with fallback product data and price calculation
                const fallbackPrice = item.price || item.unitPrice || 0;
                itemsWithProducts.push({
                  ...item,
                  price: fallbackPrice,
                  totalPrice: item.totalPrice || (fallbackPrice * (item.quantity || 1)),
                  productId: {
                    _id: item.productId,
                    productName: 'Product Name',
                    mainImage: null,
                    subImages: []
                  }
                });
              }
            }
          }

          // Build orderData with populated items
          orderData = {
            orderId: transaction.transactionId,
            items: itemsWithProducts, // ✅ Now contains populated product data
            deliveryAddress: actualDeliveryAddress || {
              name: 'Address not found',
              addressType: 'N/A',
              landMark: 'N/A',
              city: 'N/A',
              state: 'N/A',
              pincode: 'N/A',
              phone: 'N/A'
            },
            paymentMethod: transaction.paymentMethod,
            subtotal: transaction.orderData.pricing?.subtotal || 0,
            totalDiscount: transaction.orderData.pricing?.totalDiscount || 0,
            amountAfterDiscount: transaction.orderData.pricing?.amountAfterDiscount || 0,
            shipping: transaction.orderData.pricing?.shipping || 0,
            total: transaction.amount || 0,
            totalItemCount: transaction.orderData.pricing?.totalItemCount || 0,
            status: 'FAILED',
            paymentStatus: 'FAILED',
            createdAt: transaction.createdAt
          };
        }
      } catch (transactionError) {
        console.error('Error fetching transaction for failure page:', transactionError);
      }
    }
    
    res.render('user/order-failure', {
      user,
      orderData,
      transactionId: transactionId,
      paypalClientId: process.env.PAYPAL_CLIENT_ID,
      title: 'Payment Failed',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      reason: decodeURIComponent(req.query.reason || 'Payment processing failed')
    });
  } catch (error) {
    console.error('Error loading order failure page:', error);
    res.status(500).render('error', { message: 'Error loading failure page' });
  }
};


// not modified
const loadRetryPaymentPage = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    console.log('🔄 Loading retry payment page for transaction:', transactionId);

    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Get transaction details
    const transactionService = require('../../services/transactionService');
    const transactionResult = await transactionService.getTransaction(transactionId);

    if (!transactionResult.success) {
      console.log('❌ Transaction not found:', transactionId);
      return res.status(404).render('error', { 
        message: 'Transaction not found',
        title: 'Transaction Not Found',
        layout: 'user/layouts/user-layout'
      });
    }

    const transaction = transactionResult.transaction;

    // Verify transaction belongs to current user
    const transactionUserId = transaction.userId && typeof transaction.userId === 'object' && transaction.userId._id
      ? transaction.userId._id.toString()
      : transaction.userId.toString();

    if (transactionUserId !== userId.toString()) {
      console.log('❌ Unauthorized access to transaction');
      return res.status(403).render('error', { 
        message: 'Unauthorized access',
        title: 'Access Denied',
        layout: 'user/layouts/user-layout'
      });
    }

    // Check if transaction is retryable
    if (!['FAILED', 'CANCELLED'].includes(transaction.status)) {
      console.log('❌ Transaction not retryable, status:', transaction.status);
      return res.status(400).render('error', { 
        message: 'This transaction cannot be retried',
        title: 'Cannot Retry Payment',
        layout: 'user/layouts/user-layout'
      });
    }

    // Get delivery address from transaction data
    let actualDeliveryAddress = null;
    if (transaction.orderData && transaction.orderData.deliveryAddressId) {
      const userAddresses = await Address.findOne({ userId });
      if (userAddresses && userAddresses.address) {
        const address = userAddresses.address.find(addr => 
          addr._id.toString() === transaction.orderData.deliveryAddressId.toString()
        );
        if (address) {
          actualDeliveryAddress = address;
        }
      }
    }

    // populate product data for each item
    const itemsWithProducts = [];
    if (transaction.orderData.items && transaction.orderData.items.length > 0) {
      for (const item of transaction.orderData.items) {
        try {
          // Populate product data
          const product = await Product.findById(item.productId)
            .select('productName mainImage subImages regularPrice salePrice')
            .lean();

          // Calculate price from available sources
          const itemPrice = item.price || item.unitPrice || product?.salePrice || product?.regularPrice || 0;
          const itemQuantity = item.quantity || 1;
          const itemTotalPrice = item.totalPrice || (itemPrice * itemQuantity);

          const populatedItem = {
            ...item,
            // Ensure all price fields are set
            price: itemPrice,
            quantity: itemQuantity,
            totalPrice: itemTotalPrice,
            size: item.size || 'N/A',
            sku: item.sku || 'N/A',
            productId: product ? {
              _id: product._id,
              productName: product.productName || 'Product Name',
              mainImage: product.mainImage || null,
              subImages: product.subImages || []
            } : {
              _id: item.productId,
              productName: 'Product Name',
              mainImage: null,
              subImages: []
            }
          };

          itemsWithProducts.push(populatedItem);
        } catch (productError) {
          console.error('Error populating product for retry item:', productError);
          // Add item with fallback product data and price calculation
          const fallbackPrice = item.price || item.unitPrice || 0;
          itemsWithProducts.push({
            ...item,
            price: fallbackPrice,
            totalPrice: item.totalPrice || (fallbackPrice * (item.quantity || 1)),
            quantity: item.quantity || 1,
            size: item.size || 'N/A',
            sku: item.sku || 'N/A',
            productId: {
              _id: item.productId,
              productName: 'Product Name',
              mainImage: null,
              subImages: []
            }
          });
        }
      }
    }

    // Build order data for retry page
    const orderData = {
      transactionId: transaction.transactionId,
      items: itemsWithProducts,
      deliveryAddress: actualDeliveryAddress || {
        name: 'Address not found',
        addressType: 'N/A',
        landMark: 'N/A',
        city: 'N/A',
        state: 'N/A',
        pincode: 'N/A',
        phone: 'N/A'
      },
      paymentMethod: transaction.paymentMethod,
      subtotal: transaction.orderData.pricing?.subtotal || 0,
      totalDiscount: transaction.orderData.pricing?.totalDiscount || 0,
      amountAfterDiscount: transaction.orderData.pricing?.amountAfterDiscount || 0,
      shipping: transaction.orderData.pricing?.shipping || 0,
      total: transaction.amount || 0,
      totalItemCount: transaction.orderData.pricing?.totalItemCount || 0,
      status: transaction.status,
      createdAt: transaction.createdAt
    };

    console.log('✅ Retry payment page loaded for transaction:', transactionId);

    res.render('user/retry-payment', {
      user,
      orderData,
      transactionId: transactionId,
      title: 'Retry Payment',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      paypalClientId: process.env.PAYPAL_CLIENT_ID,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Error loading retry payment page:', error);
    res.status(500).render('error', { 
      message: 'Error loading retry payment page',
      title: 'Server Error',
      layout: 'user/layouts/user-layout'
    });
  }
};

// Not modified
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
  loadCheckout,
  getWalletBalanceForCheckout,
  validateCheckoutStock,
  placeOrder,
  placeOrderWithValidation,
  loadOrderSuccess,
  loadOrderFailure,
  loadRetryPaymentPage,
  createTransactionForPayment,
  createPayPalOrder,
  capturePayPalOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  handlePaymentFailure,
  retryPayment,
  retryWalletPayment
};
