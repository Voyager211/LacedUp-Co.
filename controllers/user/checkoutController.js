const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Order = require('../../models/Order');
const Coupon = require('../../models/Coupon');
const crypto = require('crypto');
const mongoose = require('mongoose');
const razorpayService = require('../../services/razorpay');

const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  getOrderStatusArray,
  getPaymentStatusArray,
  PAYMENT_METHODS
} = require('../../constants/orderEnums');





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
  const timestamp = Date.now().toString(36).toUpperCase();
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

const calculateOrderTotals = (cartItems) => {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalItemCount = 0;

  cartItems.forEach(item => {
    const product = item.productId;
    const regularPrice = product.regularPrice;
    const quantity = item.quantity;

    subtotal += regularPrice * quantity;
    totalItemCount += quantity;

    const itemDiscount = (regularPrice - item.price) * quantity;
    totalDiscount += Math.max(0, itemDiscount);
  });

  const amountAfterDiscount = subtotal - totalDiscount;
  const shipping = amountAfterDiscount >= 500 ? 0 : 50;
  const total = amountAfterDiscount + shipping;

  return {
    subtotal: Math.round(subtotal),
    totalDiscount: Math.round(totalDiscount),
    amountAfterDiscount: Math.round(amountAfterDiscount),
    shipping,
    totalItemCount,
    total: Math.round(total)
  };
};


const loadCheckout = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    
    // user
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // addresses
    const userAddresses = await Address.findOne({ userId }).lean();
    const addresses = userAddresses ? userAddresses.address : [];


    // cart
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
            select: 'name brandOffer isActive isDeleted'
          }
        ]
      });

    let cartItems = [];

    if (cart && cart.items) {
      cartItems = cart.items.filter(item => {
        if (!item.productId || !item.productId.isListed || item.productId.isDeleted) {
          return false;
        }

        if (item.productId.category && (item.productId.category.isActive === false || item.productId.category.isDeleted === true)) {
          return false;
        }

        if (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true)) {
          return false;
        }

        if (item.variantId) {
          const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
          if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
            return false;
          }
        }

        return true;
      });
    }

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    // calculate totals
    const totals = calculateOrderTotals(cartItems);

    let couponDiscount = 0;
    let appliedCoupon = null;

    if (req.session.appliedCoupon) {
      appliedCoupon = req.session.appliedCoupon;
      couponDiscount = appliedCoupon.discountAmount || 0;
    }

    const finalTotal = Math.max(0, totals.total - couponDiscount);

    res.render('user/checkout', {
      user,
      cartItems,
      addresses,
      addressDocumentId: userAddresses?._id || null,
      totalItemCount: totals.totalItemCount,
      totalDiscount: totals.totalDiscount,
      subtotal: totals.subtotal,
      amountAfterDiscount: totals.amountAfterDiscount,
      couponDiscount: Math.round(couponDiscount),
      appliedCoupon,
      shipping: totals.shipping,
      total: Math.round(finalTotal),
      walletBalance: 0,
      paypalClientId: '',
      title: 'Checkout',
      layout: 'user/layouts/user-layout',
      active: 'checkout',
      geoapifyApiKey: process.env.GEOAPIFY_API_KEY
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Error loading checkout page' });
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

    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isActive isDeleted categoryOffer' },
          { path: 'brand', select: 'name isActive isDeleted brandOffer' }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      console.log('Cart is empty');
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    const validationResults = {
      validItems: [],
      invalidItems: [],
    };

    // Validate each cart item
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
      }

      const availabilityCheck = validateProductAvailability(item.productId);
      if (!availabilityCheck.isValid) {
        validationResults.invalidItems.push({
          ...itemData,
          reason: availabilityCheck.reason
        });
        continue;
      }

      const stockCheck = validateVariantStock(item.productId, item.variantId, item.quantity);
      if (!stockCheck.isValid) {
        validationResults.invalidItems.push({
          ...itemData,
          reason: stockCheck.reason,
          availableStock: stockCheck.availableStock
        });
        continue;
      }

      validationResults.validItems.push(itemData);
    }

    if (validationResults.validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in your cart are available for checkout',
        code: 'NO_CHECKOUT_ITEMS',
        validationResults
      });
    }

    const responseMessage = validationResults.validItems.length === cart.items.length
      ? 'All cart items are available for checkout'
      : 'Some items are unavailable but checkout can be processed';

    return res.json({
      success: true,
      message: responseMessage,
      validationResults,
      totalValidItems: validationResults.validItems.length,
      totalItems: cart.items.length
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to validate cart for checkout',
      code: 'VALIDATION_ERROR'
    });
  }
};




// 3. place order with validation
const placeOrderWithValidation = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId, addressIndex, paymentMethod } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    if (!deliveryAddressId || addressIndex === undefined || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    if (![PAYMENT_METHODS.COD, PAYMENT_METHODS.UPI].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Only COD and UPI are supported',
        code: 'INVALID_PAYMENT_METHOD'
      });
    }

    // Fetch and validate cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isActive isDeleted categoryOffer' },
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

    const stockIssues = [];

    for (const item of cart.items) {
      const productName = item.productId?.productName || 'Unknown Product';

      // Check product availability
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

      // Check variant stock
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

    if (stockIssues.length > 0) {
      const errorMessages = stockIssues.map((issue, index) => 
        `${index + 1}. ${issue.productName} (Size: ${issue.size}) \n ${issue.error}`
      );

      return res.status(400).json({
        success: false,
        message: 'Some items in your cart have stock issues:\n\n' + errorMessages.join('\n\n') + '\n\nPlease update your cart before proceeding.',
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    if (paymentMethod === PAYMENT_METHODS.COD) {
      return await handleCODOrder(req, res, cart);
    } else if (paymentMethod === PAYMENT_METHODS.UPI) {
      return await createRazorpayPayment(req, res);
    }

  } catch (error) {
    console.error('Error in placeOrderWithValidation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate and place order',
      code: 'VALIDATION_ERROR',
      error: error.message
    });
  }
};




// handle cod order
const handleCODOrder = async (req, res, cart) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId, addressIndex } = req.body;

    console.log('Processing COD order for user:', userId);

    const totals = calculateOrderTotals(cart.items);

    let couponDiscount = 0;
    let appliedCouponId = null;

    if (req.session.appliedCoupon) {
      try {
        const coupon = await Coupon.findById(req.session.appliedCoupon._id);

        // validate coupon
        if (!coupon || !coupon.isActive) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Applied coupon is no longer valid. Please try again without the coupon.',
            code: 'INVALID_COUPON'
          });
        }

        const now = new Date();
        if (now < new Date(coupon.validFrom) || now > new Date(coupon.validTo)) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Coupon has expired or is not yet active',
            code: 'COUPON_EXPIRED'
          });
        }

        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Coupon usage limit has been reached',
            code: 'COUPON_LIMIT_REACHED'
          });
        }

        const userUsageCount = coupon.usedBy.filter(usage => usage.user.toString() === userId.toString()).length;

        if (coupon.userLimit && userUsageCount >= coupon.userLimit) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'You have already used this coupon the maximum number of times',
            code: 'USER_COUPON_LIMIT_REACHED'
          });
        }

        if (coupon.minimumOrderValue && totals.total < coupon.minimumOrderValue) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: `Minimum order value of ₹${coupon.minimumOrderValue} required for the coupon`,
            code: 'MIN_ORDER_VALUE_NOT_MET'
          });
        }

        couponDiscount = req.session.appliedCoupon.discountAmount || 0;
        appliedCouponId = req.session.appliedCoupon._id;
        console.log(`Coupon validated and applied: ${coupon.code} (₹${couponDiscount} off)`);

      } catch (couponError) {
        console.error('Error validating coupon:', couponError);
        delete req.session.appliedCoupon;
        return res.status(400).json({
          success: false,
          message: 'Error validating coupon. Please try again without the coupon.',
          code: 'COUPON_VALIDATION_ERROR'
        });
      }
    }

    const finalTotal = Math.max(0, totals.total - couponDiscount);
    

    // prepare order items
    const orderItems = cart.items.map(item => ({
      productId: item.productId._id,
      variantId: item.variantId,
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      status: ORDER_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.PENDING,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order placed with COD'
      }]
    }));

    try {
      await deductStock(orderItems);
      console.log('Stock deducted successfully!');
    } catch (error) {
      console.error('Stock deduction failed:', error);
      return res.status(400).json({
          success: false,
          message: 'Failed to process order due to stock issues',
          error: error.message,
          code: 'STOCK_DEDUCTION_FAILED'
      });
    }

    const addressObjectId = new mongoose.Types.ObjectId(deliveryAddressId);

    const order = new Order({
      orderId: generateOrderId(),
      user: userId,
      items: orderItems,
      deliveryAddress: {
        addressId: addressObjectId,
        addressIndex: parseInt(addressIndex)
      },
      couponApplied: appliedCouponId,
      couponDiscount: Math.round(couponDiscount),
      couponCode: req.session.appliedCoupon?.code || null,
      paymentMethod: PAYMENT_METHODS.COD,
      paymentStatus: PAYMENT_STATUS.PENDING,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      amountAfterDiscount: totals.amountAfterDiscount,
      shipping: totals.shipping,
      totalAmount: Math.round(finalTotal),
      totalItemCount: totals.totalItemCount,
      status: ORDER_STATUS.PENDING,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order placed successfully with COD'
      }]
    });

    try {
      await order.save();
      order.orderDocumentId = order._id;
      await order.save();
      console.log(`Order created successfully: ${order.orderId}`);
    } catch (saveError) {
      console.error('Error saving order:', saveError);
      await restoreStock(orderItems);
      return res.status(500).json({
        success: false,
        message: 'Failed to create order',
        code: 'ORDER_CREATION_FAILED'
      });
    }


    if (appliedCouponId) {
      try {
        const coupon = await Coupon.findById(appliedCouponId);
        if (coupon) {
          coupon.usedCount += 1;
          coupon.usedBy.push({
            user: userId,
            usedAt: new Date(),
            orderId: order._id
          });
          await coupon.save();
          console.log(`Coupon usage updated: ${coupon.code}`);
        }
      } catch (couponError) {
        console.error('Error updating coupon usage:', couponError);
      }
    }

    cart.items = [];
    await cart.save();
    console.log('Cart cleared');

    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
      console.log('Coupon removed from session');
    }

    return res.json({
      success: true,
      message: 'COD Order placed successfully',
      orderId: order.orderId,
      orderDocumentId: order._id,
      redirectUrl: `/checkout/order-success/${order.orderId}`
    });

  } catch (error) {
    console.error('Error in handleCODOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process COD order',
      code: 'COD_ORDER_FAILED',
      error: error.message
    });
  }
};

// Create Razorpay Order
const createRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { deliveryAddressId, addressIndex } = req.body;

    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'category', select: 'name isActive isDeleted' },
          { path: 'brand', select: 'name isActive isDeleted' }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    // Calculate totals
    const totals = calculateOrderTotals(cart.items);
    let couponDiscount = 0;
    let appliedCouponId = null;

    if (req.session.appliedCoupon) {
      try {
        const coupon = await Coupon.findById(req.session.appliedCoupon._id);

        if (!coupon || !coupon.isActive) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Applied coupon is no longer valid',
            code: 'INVALID_COUPON'
          });
        }

        const now = new Date();
        if (now < new Date(coupon.validFrom) || now > new Date(coupon.validTo)) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Coupon has expired',
            code: 'COUPON_EXPIRED'
          });
        }

        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'Coupon usage limit reached',
            code: 'COUPON_LIMIT_REACHED'
          });
        }

        const userUsageCount = coupon.usedBy.filter(usage => usage.user.toString() === userId.toString()).length;
        if (coupon.userLimit && userUsageCount >= coupon.userLimit) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: 'You have reached the coupon usage limit',
            code: 'USER_COUPON_LIMIT_REACHED'
          });
        }

        if (coupon.minimumOrderValue && totals.total < coupon.minimumOrderValue) {
          delete req.session.appliedCoupon;
          return res.status(400).json({
            success: false,
            message: `Minimum order value of ₹${coupon.minimumOrderValue} required`,
            code: 'MIN_ORDER_VALUE_NOT_MET'
          });
        }

        couponDiscount = req.session.appliedCoupon.discountAmount || 0;
        appliedCouponId = req.session.appliedCoupon._id;
        console.log(`Coupon validated: ${coupon.code} (₹${couponDiscount} off)`);

      } catch (couponError) {
        console.error('Coupon validation error:', couponError);
        delete req.session.appliedCoupon;
        return res.status(400).json({
          success: false,
          message: 'Error validating coupon',
          code: 'COUPON_VALIDATION_ERROR'
        });
      }
    }

    const finalTotal = Math.max(0, totals.total - couponDiscount);

    // Create temporary order ID for Razorpay
    const tempOrderId = `TEMP-${generateOrderId()}`;

    const razorpayOrder = await razorpayService.createRazorpayOrder(tempOrderId, finalTotal);

    console.log(`Razorpay order created: ${razorpayOrder.id}`);

    req.session.pendingRazorpayOrder = {
      tempOrderId,
      userId,
      deliveryAddressId,
      addressIndex,
      cart: cart.items,
      totals,
      couponDiscount,
      appliedCouponId,
      razorpayOrderId: razorpayOrder.id,
      amount: finalTotal
    };

    return res.json({
      success: true,
      message: 'Razorpay order created successfully',
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: Math.round(finalTotal * 100), // Convert to paise for frontend
        currency: 'INR',
        userName: req.user?.fullname || 'User',
        userEmail: req.user?.email || '',
        userPhone: req.user?.phone || '',
        keyId: process.env.RAZORPAY_KEY_ID,
        description: `Order for ${req.user?.fullname || 'Customer'}`
      }
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create Razorpay order',
      code: 'RAZORPAY_ORDER_FAILED',
      error: error.message
    });
  }
};



// Verify Razorpay Payment & Create Order
const verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Payment details incomplete',
        code: 'INCOMPLETE_PAYMENT_DETAILS'
      });
    }

    // Verify signature
    const isSignatureValid = razorpayService.verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isSignatureValid) {
      console.error('❌ Signature verification failed');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed - Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    console.log('✅ Signature verified successfully');

    // Get pending order from session
    const pendingOrder = req.session.pendingRazorpayOrder;
    const paymentFailure = req.session.paymentFailure;

    if (!pendingOrder) {
      return res.status(400).json({
        success: false,
        message: 'Pending order not found in session',
        code: 'NO_PENDING_ORDER'
      });
    }

    // Verify razorpay order ID matches
    if (pendingOrder.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID mismatch',
        code: 'ORDER_MISMATCH'
      });
    }

    console.log('📦 Processing payment verification...');

    // ✅ Check if this is a retry (update existing failed order) or new order
    let order = null;
    
    if (paymentFailure && paymentFailure.orderId) {
      // RETRY - Update existing failed order
      console.log('🔄 Updating failed order:', paymentFailure.orderId);
      
      try {
        order = await Order.findByIdAndUpdate(
          paymentFailure.orderId,
          {
            paymentStatus: PAYMENT_STATUS.COMPLETED,
            razorpayPaymentId: razorpayPaymentId,
            status: ORDER_STATUS.PROCESSING,
            $push: {
              statusHistory: {
                status: ORDER_STATUS.PROCESSING,
                updatedAt: new Date(),
                notes: 'Payment successful on retry - Order processing'
              }
            }
          },
          { new: true }
        );
        
        console.log(`✅ Failed order updated: ${order.orderId}`);
      } catch (updateError) {
        console.error('❌ Error updating order:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update order after payment',
          code: 'ORDER_UPDATE_FAILED',
          error: updateError.message
        });
      }
    } else {
      // NEW ORDER - Create fresh order
      console.log('✨ Creating new order');

      // Convert deliveryAddressId to ObjectId
      const addressObjectId = new mongoose.Types.ObjectId(pendingOrder.deliveryAddressId);

      // Create order items
      const orderItems = pendingOrder.cart.map(item => ({
        productId: item.productId._id,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        statusHistory: [{
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
          notes: 'Order placed with UPI payment'
        }]
      }));

      // Deduct stock
      try {
        await deductStock(orderItems);
        console.log('✅ Stock deducted successfully');
      } catch (error) {
        console.error('❌ Stock deduction failed:', error);
        return res.status(400).json({
          success: false,
          message: 'Failed to process order - Stock issue',
          error: error.message,
          code: 'STOCK_DEDUCTION_FAILED'
        });
      }

      // Create Order in database
      order = new Order({
        orderId: generateOrderId(),
        user: userId,
        items: orderItems,
        deliveryAddress: {
          addressId: addressObjectId,
          addressIndex: parseInt(pendingOrder.addressIndex)
        },
        couponApplied: pendingOrder.appliedCouponId,
        couponDiscount: Math.round(pendingOrder.couponDiscount),
        paymentMethod: PAYMENT_METHODS.UPI,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        razorpayOrderId: razorpayOrderId,
        razorpayPaymentId: razorpayPaymentId,
        subtotal: pendingOrder.totals.subtotal,
        totalDiscount: pendingOrder.totals.totalDiscount,
        amountAfterDiscount: pendingOrder.totals.amountAfterDiscount,
        shipping: pendingOrder.totals.shipping,
        totalAmount: Math.round(pendingOrder.amount),
        totalItemCount: pendingOrder.totals.totalItemCount,
        status: ORDER_STATUS.PROCESSING,
        statusHistory: [{
          status: ORDER_STATUS.PROCESSING,
          updatedAt: new Date(),
          notes: 'Payment successful - Order processing'
        }]
      });

      try {
        await order.save();
        console.log(`✅ Order created: ${order.orderId}`);
      } catch (saveError) {
        console.error('❌ Error saving order:', saveError);
        await restoreStock(orderItems);
        return res.status(500).json({
          success: false,
          message: 'Failed to create order after payment',
          code: 'ORDER_CREATION_FAILED',
          error: saveError.message
        });
      }
    }

    // Update coupon usage if applied (only once per order)
    if (pendingOrder.appliedCouponId) {
      // Check if coupon was already applied for this order (on retry)
      const existingUsage = await Coupon.findOne({
        _id: pendingOrder.appliedCouponId,
        'usedBy.orderId': order._id
      });

      if (!existingUsage) {
        await Coupon.findByIdAndUpdate(
          pendingOrder.appliedCouponId,
          {
            $inc: { usedCount: 1 },
            $push: {
              usedBy: {
                user: userId,
                usedAt: new Date(),
                orderId: order._id
              }
            }
          }
        );
        console.log('✅ Coupon usage updated');
      } else {
        console.log('⏭️ Coupon already used for this order (retry)');
      }
    }

    // Clear cart only if new order
    if (!paymentFailure || !paymentFailure.orderId) {
      const cart = await Cart.findOne({ userId });
      if (cart) {
        cart.items = [];
        await cart.save();
        console.log('✅ Cart cleared');
      }
    }

    // Clear session
    delete req.session.pendingRazorpayOrder;
    delete req.session.paymentFailure;
    delete req.session.appliedCoupon;

    return res.json({
      success: true,
      message: paymentFailure ? 'Payment verified successfully on retry' : 'Payment verified and order created successfully',
      data: {
        orderId: order.orderId,
        orderDocumentId: order._id,
        redirectUrl: `/checkout/order-success/${order.orderId}`
      }
    });

  } catch (error) {
    console.error('❌ Error verifying Razorpay payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment verification error',
      code: 'VERIFICATION_ERROR',
      error: error.message
    });
  }
};

// Handle Payment Failure
const handlePaymentFailure = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { razorpayOrderId, error } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    console.log('❌ Payment failed for Razorpay Order:', razorpayOrderId);
    console.log('Error details:', error);

    const pendingOrder = req.session.pendingRazorpayOrder;
    
    if (!pendingOrder) {
      return res.status(400).json({
        success: false,
        message: 'No pending order found',
        code: 'NO_PENDING_ORDER'
      });
    }

    // ✅ Create Order with PENDING status and FAILED payment status
    const addressObjectId = new mongoose.Types.ObjectId(pendingOrder.deliveryAddressId);

    const orderItems = pendingOrder.cart.map(item => ({
      productId: item.productId._id,
      variantId: item.variantId,
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      status: ORDER_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.FAILED,  // ✅ Payment Failed
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: 'Order created but payment failed'
      }]
    }));

    // Deduct stock
    try {
      await deductStock(orderItems);
      console.log('✅ Stock deducted for failed order');
    } catch (stockError) {
      console.error('❌ Stock deduction failed:', stockError);
      return res.status(400).json({
        success: false,
        message: 'Stock unavailable',
        error: stockError.message,
        code: 'STOCK_DEDUCTION_FAILED'
      });
    }

    // Create Order in database
    const order = new Order({
      orderId: generateOrderId(),
      user: userId,
      items: orderItems,
      deliveryAddress: {
        addressId: addressObjectId,
        addressIndex: parseInt(pendingOrder.addressIndex)
      },
      couponApplied: pendingOrder.appliedCouponId,
      couponDiscount: Math.round(pendingOrder.couponDiscount),
      paymentMethod: PAYMENT_METHODS.UPI,
      paymentStatus: PAYMENT_STATUS.FAILED,  // ✅ Payment Failed
      razorpayOrderId: razorpayOrderId,
      subtotal: pendingOrder.totals.subtotal,
      totalDiscount: pendingOrder.totals.totalDiscount,
      amountAfterDiscount: pendingOrder.totals.amountAfterDiscount,
      shipping: pendingOrder.totals.shipping,
      totalAmount: Math.round(pendingOrder.amount),
      totalItemCount: pendingOrder.totals.totalItemCount,
      status: ORDER_STATUS.PENDING,  // ✅ Order Pending
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        updatedAt: new Date(),
        notes: `Payment failed: ${error?.description || 'Payment processing failed'}`
      }]
    });

    try {
      await order.save();
      console.log(`✅ Order created with FAILED payment: ${order.orderId}`);

      // Store failed order ID in session for retry
      req.session.paymentFailure = {
        transactionId: razorpayOrderId || `TXN-${Date.now()}`,
        reason: error?.description || error?.reason || 'Payment processing failed. Please try again.',
        failedAt: new Date(),
        orderId: order._id,  // ✅ Store failed order ID
        orderNumber: order.orderId,
        orderData: {
          items: pendingOrder.cart,
          deliveryAddressId: pendingOrder.deliveryAddressId,
          addressIndex: pendingOrder.addressIndex,
          subtotal: pendingOrder.totals.subtotal,
          totalDiscount: pendingOrder.totals.totalDiscount,
          shipping: pendingOrder.totals.shipping,
          total: pendingOrder.amount,
          totalItemCount: pendingOrder.totals.totalItemCount,
          paymentMethod: 'upi',
          couponDiscount: pendingOrder.couponDiscount,
          appliedCouponId: pendingOrder.appliedCouponId
        }
      };

      return res.json({
        success: true,
        message: 'Order created with failed payment status',
        data: {
          redirectUrl: `/checkout/order-failure/${razorpayOrderId || 'unknown'}`,
          orderId: order._id,
          orderNumber: order.orderId
        }
      });

    } catch (saveError) {
      console.error('❌ Error saving failed order:', saveError);
      await restoreStock(orderItems);
      return res.status(500).json({
        success: false,
        message: 'Failed to create order',
        code: 'ORDER_CREATION_FAILED',
        error: saveError.message
      });
    }

  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing payment failure',
      code: 'PAYMENT_FAILURE_ERROR',
      error: error.message
    });
  }
};


const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.redirect('/login');
    }

    // user
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // order 
    const order = await Order.findOne({ orderId: orderId, user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages regularPrice salePrice'
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    let actualDeliveryAddress = null;
    
    if (order.deliveryAddress && order.deliveryAddress.addressId) {
      const addressDoc = await Address.findById(order.deliveryAddress.addressId);
      const addressIndex = order.deliveryAddress.addressIndex;

      if (addressDoc) {
        if (addressDoc.address && Array.isArray(addressDoc.address) && addressDoc.address[addressIndex]) {
          actualDeliveryAddress = addressDoc.address[addressIndex];
          console.log('Found address:', actualDeliveryAddress);
        } else {
          console.error('Address not found at index:', addressIndex);
          console.error('Available addresses:', addressDoc.address ? addressDoc.address.length : 0);
          console.error('addressDoc.address:', addressDoc.address);
        }
      } else {
        console.error('Address document not found in database for ID:', order.deliveryAddress.addressId);
      }
    } else {
      console.error('No deliveryAddress or addressId in order');
    }

    const orderData = {
      orderId: order.orderId,
      items: order.items.map(item => {
        const itemObj = item.toObject();
        
        if (item.productId && typeof item.productId === 'object') {
          itemObj.productId = {
            _id: item.productId._id,
            productName: item.productId.productName || 'Product Name',
            mainImage: item.productId.mainImage || null,
            subImages: item.productId.subImages || []
          };
        } else {
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
      couponDiscount: order.couponDiscount || 0,
      couponCode: order.couponCode || null,
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

// Load Order Failure Page
const loadOrderFailure = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { transactionId } = req.params;

    if (!userId) {
      return res.redirect('/login');
    }

    const paymentFailure = req.session.paymentFailure;

    if (!paymentFailure) {
      return res.redirect('/cart');
    }

    console.log('📄 Loading order failure page for transaction:', transactionId);

    let deliveryAddress = null;
    if (paymentFailure.orderData?.deliveryAddressId) {
      try {
        const userAddresses = await Address.findOne({ userId }).lean();
        if (userAddresses && userAddresses.address) {
          const addressIndex = parseInt(paymentFailure.orderData.addressIndex) || 0;
          deliveryAddress = userAddresses.address[addressIndex];
        }
      } catch (addressError) {
        console.error('Error fetching address:', addressError);
      }
    }

    let populatedItems = [];
    if (paymentFailure.orderData?.items) {
      for (const item of paymentFailure.orderData.items) {
        try {
          const product = await Product.findById(item.productId._id)
            .select('productName mainImage subImages')
            .lean();
          
          populatedItems.push({
            ...item,
            productId: product || item.productId
          });
        } catch (err) {
          populatedItems.push(item);
        }
      }
    }

    const orderData = {
      ...paymentFailure.orderData,
      items: populatedItems,
      deliveryAddress: deliveryAddress || null
    };

    return res.render('user/order-failure', {
      transactionId: paymentFailure.transactionId || transactionId,
      reason: paymentFailure.reason,
      orderData,
      title: 'Order Failed',
      layout: 'user/layouts/user-layout',
      active: 'checkout'
    });

  } catch (error) {
    console.error('Error loading order failure page:', error);
    return res.status(500).render('error', {
      message: 'Error loading order failure page',
      layout: 'user/layouts/user-layout'
    });
  }
};

// Load Retry Payment Page
const loadRetryPaymentPage = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { transactionId } = req.params;

    if (!userId) {
      return res.redirect('/login');
    }

    const paymentFailure = req.session.paymentFailure;

    if (!paymentFailure) {
      return res.redirect('/cart');
    }

    // Fetch the failed order from database
    let failedOrder = null;
    try {
      failedOrder = await Order.findById(paymentFailure.orderId)
        .populate({
          path: 'items.productId',
          select: 'productName mainImage subImages'
        })
        .lean();
    } catch (err) {
      console.error('Error fetching failed order:', err);
    }

    // Validate all items are still available for retry
    if (failedOrder) {
      for (const item of failedOrder.items) {
        try {
          const product = await Product.findById(item.productId._id).lean();
          
          if (!product || !product.isListed || product.isDeleted) {
            // ✅ Redirect instead of render error
            req.session.errorMessage = 'One or more items in your order are no longer available. Please review your cart.';
            return res.redirect('/cart');
          }

          // Check variant stock
          if (item.variantId && product.variants) {
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
              // ✅ Redirect instead of render error
              req.session.errorMessage = `${item.productId.productName} (Size: ${item.size}) is no longer available in the requested quantity.`;
              return res.redirect('/cart');
            }
          }
        } catch (itemError) {
          console.error('Error validating item:', itemError);
        }
      }
    }

    // Fetch full address
    let deliveryAddress = null;
    try {
      const userAddresses = await Address.findOne({ userId }).lean();
      
      if (userAddresses && userAddresses.address) {
        const addressIndex = parseInt(paymentFailure.orderData.addressIndex) || 0;
        deliveryAddress = userAddresses.address[addressIndex];
      }
    } catch (addressError) {
      console.error('Error fetching address:', addressError);
    }

    // Populate product details
    let populatedItems = [];
    if (paymentFailure.orderData?.items) {
      for (const item of paymentFailure.orderData.items) {
        try {
          const product = await Product.findById(item.productId._id)
            .select('productName mainImage subImages')
            .lean();
          
          populatedItems.push({
            ...item,
            productId: product || item.productId
          });
        } catch (err) {
          populatedItems.push(item);
        }
      }
    }

    const orderData = {
      items: populatedItems,
      subtotal: paymentFailure.orderData.subtotal,
      totalDiscount: paymentFailure.orderData.totalDiscount,
      shipping: paymentFailure.orderData.shipping,
      total: paymentFailure.orderData.total,
      totalItemCount: paymentFailure.orderData.totalItemCount,
      couponDiscount: paymentFailure.orderData.couponDiscount,
      deliveryAddress: deliveryAddress || null,
      deliveryAddressId: paymentFailure.orderData.deliveryAddressId,
      addressIndex: paymentFailure.orderData.addressIndex
    };

    return res.render('user/retry-payment', {
      transactionId: transactionId,
      orderId: paymentFailure.orderId,
      orderNumber: paymentFailure.orderNumber,
      failureReason: paymentFailure.reason,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      orderData,
      title: 'Retry Payment',
      layout: 'user/layouts/user-layout',
      active: 'checkout'
    });

  } catch (error) {
    console.error('Error loading retry payment page:', error);
    // ✅ Redirect to cart on error instead of render error
    return res.redirect('/cart');
  }
};



// Retry razorpay Payment
const retryRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.userId;
    const { transactionId } = req.params;

    if (!userId) {
      return res.redirect('/login');
    }

    console.log('🔄 Retrying payment for transaction:', transactionId);

    const paymentFailure = req.session.paymentFailure;

    if (!paymentFailure) {
      console.log('⚠️ No payment failure found, redirecting to cart');
      return res.redirect('/cart');
    }

    // Validate all items are still available before retry
    try {
      const failedOrder = await Order.findById(paymentFailure.orderId)
        .populate('items.productId')
        .lean();

      if (!failedOrder) {
        return res.redirect('/cart');
      }

      // Check each item's stock
      for (const item of failedOrder.items) {
        const product = await Product.findById(item.productId._id).lean();
        
        if (!product || !product.isListed || product.isDeleted) {
          console.warn(`⚠️ Product no longer available: ${item.productId.productName}`);
          return res.redirect('/cart');
        }

        if (item.variantId && product.variants) {
          const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
            console.warn(`⚠️ Variant out of stock: ${item.sku}`);
            return res.redirect('/cart');
          }
        }
      }

      console.log('✅ All items validated for retry');
    } catch (validationError) {
      console.error('Error validating items:', validationError);
      return res.redirect('/cart');
    }

    // Don't clear paymentFailure - keep it for verifyRazorpayPayment to detect retry
    // Redirect to retry payment page (which will call handleUPIPayment)
    return res.redirect(`/checkout/retry-payment/${transactionId}`);

  } catch (error) {
    console.error('❌ Error in retryRazorpayPayment:', error);
    return res.redirect('/cart');
  }
};




module.exports = {
  loadCheckout,
  validateCheckoutStock,
  placeOrderWithValidation,
  createRazorpayPayment,
  verifyRazorpayPayment,
  loadOrderSuccess,
  loadOrderFailure,
  loadRetryPaymentPage,
  retryRazorpayPayment,
  handlePaymentFailure
};
