const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const Address = require('../../models/Address');
const User = require('../../models/User');
const Return = require('../../models/Return');
const orderService = require('../../services/orderService');

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

// Place order
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

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
    const total = amountAfterDiscount + shipping;

    // Generate order ID
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);

    // Create order with new address reference structure and statusHistory
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
        paymentStatus: paymentMethod === 'cod' ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COMPLETED
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
      totalAmount: Math.round(total),
      totalItemCount: totalItemCount,
      status: ORDER_STATUS.PENDING,                
      statusHistory: [{
        status: ORDER_STATUS.PENDING,                    
        updatedAt: new Date(),
        notes: 'Order placed'
      }],
      paymentStatus: paymentMethod === 'cod' ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COMPLETED 
    });

    await newOrder.save();

    // Clear cart
    cart.items = [];
    await cart.save();

    // For COD, redirect to success page
    if (paymentMethod === 'cod') {
      return res.json({
        success: true,
        message: 'Order placed successfully',
        orderId: orderId,
        redirectUrl: `/order-success/${orderId}`
      });
    }

    // For other payment methods, handle payment processing here
    // For now, just redirect to success page
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: orderId,
      redirectUrl: `/order-success/${orderId}`
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order'
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

// Get all orders for user
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    const cancellationReasons = CANCELLATION_REASONS;
    const returnReasons = RETURN_REASONS;

    const page = 1;
    const limit = 4;
    
    // ✅ CORRECTED: Simplified and fixed aggregation pipeline
    const pipeline = [
      { $match: { user: userId } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'items.productId'
        }
      },
      {
        $unwind: {
          path: '$items.productId',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          orderId: 1,
          orderDate: '$createdAt',
          paymentMethod: 1,
          paymentStatus: 1,
          orderStatus: '$status',
          totalAmount: 1,
          itemId: '$items._id',
          productId: '$items.productId',
          productName: { $ifNull: ['$items.productId.productName', 'Product'] },
          productImage: '$items.productId.mainImage',
          sku: '$items.sku',
          size: '$items.size',
          quantity: '$items.quantity',
          price: '$items.price',
          totalPrice: '$items.totalPrice',
          status: { $ifNull: ['$items.status', '$status'] }
        }
      },
      { $sort: { orderDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: 0 },
            { $limit: limit }
          ]
        }
      }
    ];

    const result = await Order.aggregate(pipeline);
    const orderItems = result[0].data || [];
    
    // ✅ ENHANCED: Better safe access with fallback
    const metadata = result[0].metadata || [];
    const totalItems = metadata.length > 0 ? metadata[0].total : orderItems.length;
    const totalPages = Math.ceil(totalItems / limit);

    // ✅ DEBUG: Enhanced logging
    console.log('🔧 getUserOrders Pagination Debug:', {
      totalItems,
      totalPages,
      orderItemsLength: orderItems.length,
      metadataLength: metadata.length,
      page,
      limit
    });

    // Get return requests
    const itemIds = orderItems.map(item => item.itemId);
    const returnRequests = await Return.find({ itemId: { $in: itemIds } });
    const returnRequestsMap = {};
    returnRequests.forEach(returnReq => {
      returnRequestsMap[returnReq.itemId.toString()] = returnReq;
    });

    orderItems.forEach(item => {
      item.returnRequest = returnRequestsMap[item.itemId.toString()] || null;
    });

    res.render('user/orders', {
      user,
      orderItems,
      currentPage: page,
      totalPages,
      totalItems,
      title: 'My Orders',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      cancellationReasons: getCancellationReasonsArray(), 
      returnReasons: getReturnReasonsArray()
    });

  } catch (error) {
    console.error('Error loading orders:', error);
    res.status(500).render('errors/server-error', { 
      message: 'Error loading orders',
      error: error.message,
      title: 'Error',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      user: null, 
      cancellationReasons: CANCELLATION_REASONS,
      returnReasons: RETURN_REASONS
    });
  }
};

exports.getUserOrdersPaginated = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const status = req.query.status || '';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // ✅ CORRECTED: Simplified and fixed aggregation pipeline
    const pipeline = [
      { $match: { user: userId } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'items.productId'
        }
      },
      {
        $unwind: {
          path: '$items.productId',
          preserveNullAndEmptyArrays: true
        }
      },
      // Add status filter for items if needed
      ...(status ? [{ $match: { 'items.status': status } }] : []),
      {
        $project: {
          orderId: 1,
          orderDate: '$createdAt',
          paymentMethod: 1,
          paymentStatus: 1,
          orderStatus: '$status',
          totalAmount: 1,
          itemId: '$items._id',
          productId: '$items.productId',
          productName: { $ifNull: ['$items.productId.productName', 'Product'] },
          productImage: '$items.productId.mainImage',
          sku: '$items.sku',
          size: '$items.size',
          quantity: '$items.quantity',
          price: '$items.price',
          totalPrice: '$items.totalPrice',
          status: { $ifNull: ['$items.status', '$status'] }
        }
      },
      { $sort: { orderDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ]
        }
      }
    ];

    const result = await Order.aggregate(pipeline);
    const orderItems = result[0].data || [];
    
    // ✅ ENHANCED: Better safe access with fallback
    const metadata = result[0].metadata || [];
    const totalItems = metadata.length > 0 ? metadata[0].total : orderItems.length;
    const totalPages = Math.ceil(totalItems / limit);


    // Get return requests for these items
    const itemIds = orderItems.map(item => item.itemId);
    const returnRequests = await Return.find({ itemId: { $in: itemIds } });
    const returnRequestsMap = {};
    returnRequests.forEach(returnReq => {
      returnRequestsMap[returnReq.itemId.toString()] = returnReq;
    });

    // Add return request info to items
    orderItems.forEach(item => {
      item.returnRequest = returnRequestsMap[item.itemId.toString()] || null;
    });

    res.json({
      success: true,
      data: {
        orderItems,
        currentPage: page,
        totalPages,
        totalItems,
        filters: {
          status
        }
      }
    });

  } catch (error) {
    console.error('Error fetching paginated orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading orders'
    });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.redirect('/login');
    }

    // Extract enum values
    const cancellationReasons = CANCELLATION_REASONS;
    const returnReasons = RETURN_REASONS;


    // Get user data
    const user = await User.findById(userId).select('name email profilePhoto');
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
      })
      .lean();

    if (!order) {
      return res.status(404).render('errors/404', {
        message: 'Order not found',
        layout: 'user/layouts/user-layout',
        title: 'Order Not Found',
        active: 'orders',
        cancellationReasons: CANCELLATION_REASONS,
        returnReasons: RETURN_REASONS
      });
    }

    // Get return requests for this order
    const returnRequests = await Return.find({ orderId: orderId, userId: userId });
    const returnRequestsMap = {};
    returnRequests.forEach(returnReq => {
      returnRequestsMap[returnReq.itemId.toString()] = returnReq;
    });

    // Add return request information to each item
    order.items = order.items.map(item => ({
      ...item,
      returnRequest: returnRequestsMap[item._id.toString()] || null
    }));

    // Get the actual delivery address from the populated address document
    if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
      const addressIndex = order.deliveryAddress.addressIndex;
      const actualAddress = order.deliveryAddress.addressId.address[addressIndex];
      order.deliveryAddress = actualAddress || {
        name: 'Address not found',
        addressType: 'N/A',
        landMark: 'N/A',
        city: 'N/A',
        state: 'N/A',
        pincode: 'N/A',
        phone: 'N/A'
      };
    } else {
      order.deliveryAddress = {
        name: 'Address not found',
        addressType: 'N/A',
        landMark: 'N/A',
        city: 'N/A',
        state: 'N/A',
        pincode: 'N/A',
        phone: 'N/A'
      };
    }

    // Create comprehensive status history combining order and item level changes
    const comprehensiveStatusHistory = [];
    
    // Add order-level status history
    if (order.statusHistory && order.statusHistory.length > 0) {
      order.statusHistory.forEach(statusEntry => {
        comprehensiveStatusHistory.push({
          type: 'order',
          status: statusEntry.status,
          updatedAt: statusEntry.updatedAt,
          notes: statusEntry.notes || `Order status changed to ${statusEntry.status}`,
          itemName: null
        });
      });
    }

    // Add item-level status history
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        if (item.statusHistory && item.statusHistory.length > 0) {
          item.statusHistory.forEach(statusEntry => {
            const productName = item.productId ? item.productId.productName : 'Product';
            comprehensiveStatusHistory.push({
              type: 'item',
              status: statusEntry.status,
              updatedAt: statusEntry.updatedAt,
              notes: statusEntry.notes || `${productName} (Size: ${item.size}) status changed to ${statusEntry.status}`,
              itemName: `${productName} (Size: ${item.size})`,
              itemId: item._id
            });
          });
        }

        // Add return request history
        if (item.returnRequest && item.returnRequest.statusHistory) {
          item.returnRequest.statusHistory.forEach(statusEntry => {
            const productName = item.productId ? item.productId.productName : 'Product';
            comprehensiveStatusHistory.push({
              type: 'return',
              status: statusEntry.status,
              updatedAt: statusEntry.updatedAt,
              notes: statusEntry.notes || `Return request for ${productName} (Size: ${item.size}) ${statusEntry.status.toLowerCase()}`,
              itemName: `${productName} (Size: ${item.size})`,
              itemId: item._id,
              returnId: item.returnRequest.returnId
            });
          });
        }
      });
    }

    // Sort comprehensive history by date (newest first)
    comprehensiveStatusHistory.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Add the comprehensive status history to the order object
    order.comprehensiveStatusHistory = comprehensiveStatusHistory;

    res.render('user/order-details', {
      user,
      order,
      title: `Order Details - ${orderId}`,
      layout: 'user/layouts/user-layout',
      active: 'orders',
      cancellationReasons: getCancellationReasonsArray(),
      returnReasons: getReturnReasonsArray(),
      ORDER_STATUS: ORDER_STATUS  
    });

  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(500).render('errors/server-error', {
      message: 'Error loading order details',
      error: error.message,
      layout: 'user/layouts/user-layout',
      title: 'Error',
      active: 'orders',
      cancellationReasons: CANCELLATION_REASONS,
      returnReasons: RETURN_REASONS
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

// Cancel entire order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    // ✅ DEBUGGING - Log all received data
    console.log('🔍 BACKEND DEBUG - Cancel Order:');
    console.log('Request body:', req.body);
    console.log('Reason received:', reason);
    console.log('Reason type:', typeof reason);
    
    const validReasons = getCancellationReasonsArray();
    console.log('Valid reasons array:', validReasons);
    console.log('Valid reasons length:', validReasons.length);
    console.log('Is reason in valid array:', validReasons.includes(reason));
    console.log('First few valid reasons:', validReasons.slice(0, 3));
    console.log('================================');

    // Authentication check
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Reason validation
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please select a cancellation reason'
      });
    }

    // ✅ SINGLE validation block - no duplicates
    if (!validReasons.includes(reason)) {
      console.log('❌ Reason validation failed:', {
        received: reason,
        validOptions: validReasons
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation reason selected'
      });
    }

    // Find the order to verify ownership
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ DEBUG: Check status BEFORE cancellation
    console.log('🔍 BEFORE CANCEL ORDER:');
    console.log('Order ID:', orderId);
    console.log('Order status before:', order.status);
    console.log('Order payment status before:', order.paymentStatus);
    console.log('Order payment method:', order.paymentMethod);
    console.log('Items before cancellation:');
    order.items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`, {
        itemId: item._id,
        status: item.status,
        paymentStatus: item.paymentStatus,
        size: item.size,
        quantity: item.quantity
      });
    });
    console.log('------------------------');

    // Use OrderService to cancel order
    const result = await orderService.cancelOrder(orderId, reason, userId);

    // ✅ DEBUG: Check status AFTER cancellation
    console.log('🔍 AFTER CANCEL ORDER:');
    const orderAfter = await Order.findOne({ orderId: orderId });
    console.log('Order status after:', orderAfter.status);
    console.log('Order payment status after:', orderAfter.paymentStatus);
    console.log('Items after cancellation:');
    orderAfter.items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`, {
        itemId: item._id,
        status: item.status,
        paymentStatus: item.paymentStatus,
        size: item.size,
        quantity: item.quantity
      });
    });
    console.log('========================');

    // Restore stock for cancelled items
    for (const item of result.order.items) {
      if (item.status === ORDER_STATUS.CANCELLED) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant) {
            variant.stock += item.quantity;
            await product.save();
            console.log(`✅ Stock restored: ${item.quantity} units for ${item.size}`);
          }
        }
      }
    }

    console.log('✅ Order cancellation completed successfully');

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order'
    });
  }
};


// Cancel individual item
exports.cancelItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    // ✅ DEBUGGING - Log all received data
    console.log('🔍 BACKEND DEBUG - Cancel Item:');
    console.log('Request body:', req.body);
    console.log('Reason received:', reason);
    console.log('Reason type:', typeof reason);
    console.log('Order ID:', orderId);
    console.log('Item ID:', itemId);

    // Authentication check
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Reason validation
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please select a cancellation reason'
      });
    }

    // ✅ SINGLE validation block - declare validReasons only once
    const validReasons = getCancellationReasonsArray();
    console.log('Valid reasons array:', validReasons);
    console.log('Valid reasons length:', validReasons.length);
    console.log('Is reason in valid array:', validReasons.includes(reason));
    console.log('================================');

    if (!validReasons.includes(reason)) {
      console.log('❌ Item cancellation - Reason validation failed:', {
        received: reason,
        validOptions: validReasons
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation reason selected'
      });
    }

    // Find the order to verify ownership
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get item details before cancellation for stock restoration
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // ✅ DEBUG: Check status BEFORE item cancellation
    console.log('🔍 BEFORE CANCEL ITEM:');
    console.log('Order ID:', orderId);
    console.log('Item ID:', itemId);
    console.log('Order payment method:', order.paymentMethod);
    console.log('Target item before cancellation:', {
      itemId: item._id,
      status: item.status,
      paymentStatus: item.paymentStatus,
      size: item.size,
      quantity: item.quantity,
      price: item.price
    });
    console.log('Order status before:', order.status);
    console.log('Order payment status before:', order.paymentStatus);
    console.log('------------------------');

    // Use OrderService to cancel item
    const result = await orderService.cancelItem(orderId, itemId, reason, '', userId);

    // ✅ DEBUG: Check status AFTER item cancellation
    console.log('🔍 AFTER CANCEL ITEM:');
    const orderAfter = await Order.findOne({ orderId: orderId });
    const itemAfter = orderAfter.items.id(itemId);
    console.log('Target item after cancellation:', {
      itemId: itemAfter._id,
      status: itemAfter.status,
      paymentStatus: itemAfter.paymentStatus,
      size: itemAfter.size,
      quantity: itemAfter.quantity,
      price: itemAfter.price
    });
    console.log('Order status after:', orderAfter.status);
    console.log('Order payment status after:', orderAfter.paymentStatus);
    console.log('========================');

    // Restore stock for cancelled item
    const product = await Product.findById(item.productId);
    if (product) {
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (variant) {
        variant.stock += item.quantity;
        await product.save();
        console.log(`✅ Stock restored: ${item.quantity} units for ${item.size}`);
      }
    }

    console.log('✅ Item cancellation completed successfully');

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('❌ Error cancelling item:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel item'
    });
  }
};



// Return request for entire order
exports.requestOrderReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Return request validations
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please select a return reason'
      });
    }

    // ADD: Enum validation  
    const validReasons = getReturnReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid return reason selected'
      });
    }

    // Verify order ownership
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Use OrderService to create return requests
    const result = await orderService.requestOrderReturn(orderId, reason, userId);

    res.json({
      success: true,
      message: result.message,
      returnRequestsCount: result.itemsAffected
    });

  } catch (error) {
    console.error('Error creating order return request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit order return request'
    });
  }
};

// Return request for individual item
exports.requestItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Return request validations
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please select a return reason'
      });
    }

    // ADD: Enum validation  
    const validReasons = getReturnReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid return reason selected'
      });
    }


    // Verify order ownership
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Use OrderService to create return request
    const result = await orderService.requestItemReturn(orderId, itemId, reason, userId);

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('Error creating return request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit return request'
    });
  }
};


// Download invoice
exports.downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
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
      })
      .populate({
        path: 'user',
        select: 'name email phone'
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get the actual delivery address from the populated address document
    if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
      const addressIndex = order.deliveryAddress.addressIndex;
      const actualAddress = order.deliveryAddress.addressId.address[addressIndex];
      order.deliveryAddress = actualAddress || {
        name: 'Address not found',
        addressType: 'N/A',
        landMark: 'N/A',
        city: 'N/A',
        state: 'N/A',
        pincode: 'N/A',
        phone: 'N/A'
      };
    }

    // Generate HTML invoice
    const invoiceHTML = generateInvoiceHTML(order);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.pdf"`);

    // For now, we'll send HTML content as a fallback
    // In a production environment, you would use a library like puppeteer to generate PDF
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.html"`);
    res.send(invoiceHTML);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice'
    });
  }
};

// Helper function to generate invoice HTML
function generateInvoiceHTML(order) {
  const currentDate = new Date().toLocaleDateString('en-IN');
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice - ${order.orderId}</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                color: #333;
                line-height: 1.6;
            }
            .invoice-container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 30px;
                border: 1px solid #ddd;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #000;
                padding-bottom: 20px;
            }
            .company-name {
                font-size: 28px;
                font-weight: bold;
                color: #000;
                margin-bottom: 5px;
            }
            .invoice-title {
                font-size: 24px;
                color: #666;
                margin-top: 10px;
            }
            .invoice-info {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
            }
            .invoice-details, .customer-details {
                width: 48%;
            }
            .section-title {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 10px;
                color: #000;
                border-bottom: 1px solid #ddd;
                padding-bottom: 5px;
            }
            .details-content {
                font-size: 14px;
                line-height: 1.8;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 30px 0;
            }
            .items-table th,
            .items-table td {
                border: 1px solid #ddd;
                padding: 12px;
                text-align: left;
            }
            .items-table th {
                background-color: #f8f9fa;
                font-weight: bold;
                color: #000;
            }
            .items-table .text-right {
                text-align: right;
            }
            .summary-section {
                margin-top: 30px;
                border-top: 2px solid #000;
                padding-top: 20px;
            }
            .summary-table {
                width: 100%;
                max-width: 400px;
                margin-left: auto;
            }
            .summary-table td {
                padding: 8px 0;
                border: none;
            }
            .summary-table .total-row {
                font-weight: bold;
                font-size: 16px;
                border-top: 1px solid #ddd;
                padding-top: 10px;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                font-size: 12px;
                color: #666;
                border-top: 1px solid #ddd;
                padding-top: 20px;
            }
            @media print {
                body { margin: 0; padding: 0; }
                .invoice-container { border: none; box-shadow: none; }
            }
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <!-- Header -->
            <div class="header">
                <div class="company-name">LacedUp</div>
                <div class="invoice-title">INVOICE</div>
            </div>

            <!-- Invoice and Customer Info -->
            <div class="invoice-info">
                <div class="invoice-details">
                    <div class="section-title">Invoice Details</div>
                    <div class="details-content">
                        <strong>Invoice Number:</strong> ${order.orderId}<br>
                        <strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN')}<br>
                        <strong>Invoice Date:</strong> ${currentDate}<br>
                        <strong>Payment Method:</strong> ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod.toUpperCase()}<br>
                        <strong>Payment Status:</strong> ${order.paymentStatus}
                    </div>
                </div>
                <div class="customer-details">
                    <div class="section-title">Bill To</div>
                    <div class="details-content">
                        <strong>${order.deliveryAddress.name}</strong><br>
                        ${order.deliveryAddress.addressType}<br>
                        ${order.deliveryAddress.landMark}<br>
                        ${order.deliveryAddress.city}, ${order.deliveryAddress.state}<br>
                        PIN: ${order.deliveryAddress.pincode}<br>
                        Phone: ${order.deliveryAddress.phone}
                    </div>
                </div>
            </div>

            <!-- Items Table -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Size</th>
                        <th class="text-right">Qty</th>
                        <th class="text-right">Unit Price</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items.map(item => `
                        <tr>
                            <td>${item.productId ? item.productId.productName : 'Product'}</td>
                            <td>${item.size}</td>
                            <td class="text-right">${item.quantity}</td>
                            <td class="text-right">₹${item.price.toLocaleString('en-IN')}</td>
                            <td class="text-right">₹${item.totalPrice.toLocaleString('en-IN')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- Summary Section -->
            <div class="summary-section">
                <table class="summary-table">
                    <tr>
                        <td>Subtotal:</td>
                        <td class="text-right">₹${order.subtotal.toLocaleString('en-IN')}</td>
                    </tr>
                    ${order.totalDiscount > 0 ? `
                    <tr>
                        <td>Discount:</td>
                        <td class="text-right">-₹${order.totalDiscount.toLocaleString('en-IN')}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td>Shipping:</td>
                        <td class="text-right">${order.shipping === 0 ? 'Free' : '₹' + order.shipping.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr class="total-row">
                        <td><strong>Total Amount:</strong></td>
                        <td class="text-right"><strong>₹${order.totalAmount.toLocaleString('en-IN')}</strong></td>
                    </tr>
                </table>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>Thank you for shopping with LacedUp!</p>
                <p>For any queries, please contact our customer support.</p>
                <p>This is a computer-generated invoice and does not require a signature.</p>
            </div>
        </div>
    </body</html>
  `;
}