const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Order = require('../../models/Order');
const Coupon = require('../../models/Coupon');
const crypto = require('crypto');
const mongoose = require('mongoose');

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
        message: 'Authentication required'
      });
    }

    if (!deliveryAddressId || addressIndex=== undefined || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    if (paymentMethod !== PAYMENT_METHODS.COD) {
      return res.status(400).json({
        success: false,
        message: 'Only COD payment is currently supported',
        code: 'INVALID_PAYMENT_METHOD'
      });
    }

    // fetch and validate cart
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

    return await handleCODOrder(req, res, cart);

  } catch (error) {
    console.error('Error in placeOrderWithValidation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate and place order',
      code: 'VALIDATION_ERROR'
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








module.exports = {
  loadCheckout,
  validateCheckoutStock,
  placeOrderWithValidation,
  loadOrderSuccess
};
