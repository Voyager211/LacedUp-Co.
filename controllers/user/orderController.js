const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const Address = require('../../models/Address');
const User = require('../../models/User');
const Return = require('../../models/Return');

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
        totalPrice: item.totalPrice
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
      status: 'Pending',
      statusHistory: [{
        status: 'Pending',
        updatedAt: new Date(),
        notes: 'Order placed'
      }],
      paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Completed'
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
    const user = await User.findById(userId).select('fullname email profilePhoto');
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
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user orders with populated address data
    const orders = await Order.find({ user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages'
      })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      })
      .sort({ createdAt: -1 });

    // Get all return requests for this user
    const returnRequests = await Return.find({ userId: userId });
    const returnRequestsMap = {};
    returnRequests.forEach(returnReq => {
      const key = `${returnReq.orderId}_${returnReq.itemId}`;
      returnRequestsMap[key] = returnReq;
    });

    // Process orders to include actual delivery address and return request info
    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      
      // Get the actual delivery address from the populated address document
      if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
        const addressIndex = order.deliveryAddress.addressIndex;
        const actualAddress = order.deliveryAddress.addressId.address[addressIndex];
        orderObj.deliveryAddress = actualAddress || {
          name: 'Address not found',
          city: 'N/A',
          state: 'N/A'
        };
      } else {
        orderObj.deliveryAddress = {
          name: 'Address not found',
          city: 'N/A',
          state: 'N/A'
        };
      }

      // Add return request information to each item
      orderObj.items = orderObj.items.map(item => {
        const key = `${orderObj.orderId}_${item._id}`;
        const returnRequest = returnRequestsMap[key];
        return {
          ...item,
          returnRequest: returnRequest || null
        };
      });
      
      return orderObj;
    });

    // Flatten orders to individual items for display (similar to admin view)
    const orderItems = [];
    processedOrders.forEach(order => {
      order.items.forEach(item => {
        orderItems.push({
          orderId: order.orderId,
          orderDate: order.createdAt,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.status,
          totalAmount: order.totalAmount,
          
          // Item information
          itemId: item._id,
          productId: item.productId,
          productName: item.productId ? item.productId.productName : 'Product',
          productImage: item.productId ? item.productId.mainImage : null,
          sku: item.sku,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice,
          status: item.status || order.status,
          
          // Return request information
          returnRequest: item.returnRequest
        });
      });
    });

    res.render('user/orders', {
      user,
      orders: processedOrders,
      orderItems: orderItems,
      title: 'My Orders',
      layout: 'user/layouts/user-layout',
      active: 'orders'
    });

  } catch (error) {
    console.error('Error loading orders:', error);
    res.status(500).render('errors/server-error', { 
      message: 'Error loading orders',
      error: error.message 
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
        layout: 'user/layouts/user-layout'
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
      active: 'orders'
    });

  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(500).render('errors/server-error', {
      message: 'Error loading order details',
      error: error.message,
      layout: 'user/layouts/user-layout'
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the order
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled in current status'
      });
    }

    // Cancel the order
    await order.cancelOrder(reason);

    // Restore stock for cancelled items
    for (const item of order.items) {
      if (item.status === 'Cancelled') {
        const product = await Product.findById(item.productId);
        if (product) {
          const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant) {
            variant.stock += item.quantity;
            await product.save();
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the order
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if item can be cancelled
    if (!order.itemCanBeCancelled(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Item cannot be cancelled in current status'
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

    // Cancel the item
    await order.cancelItem(itemId, reason);

    // Restore stock for cancelled item
    const product = await Product.findById(item.productId);
    if (product) {
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (variant) {
        variant.stock += item.quantity;
        await product.save();
      }
    }

    res.json({
      success: true,
      message: 'Item cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel item'
    });
  }
};

// Return entire order
exports.returnOrder = async (req, res) => {
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

    // Find the order
    const order = await Order.findOne({ orderId: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned
    if (!order.canBeReturned()) {
      return res.status(400).json({
        success: false,
        message: 'Order can only be returned when delivered'
      });
    }

    // Return the order
    await order.returnOrder(reason);

    // Restore stock for returned items
    for (const item of order.items) {
      if (item.status === 'Returned') {
        const product = await Product.findById(item.productId);
        if (product) {
          const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variant) {
            variant.stock += item.quantity;
            await product.save();
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Return request submitted successfully'
    });

  } catch (error) {
    console.error('Error returning order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to return order'
    });
  }
};

// Return individual item
exports.returnItem = async (req, res) => {
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

    // Find the order with populated product data
    const order = await Order.findOne({ orderId: orderId, user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage'
      });
      
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if item can be returned
    if (!order.itemCanBeReturned(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Item can only be returned when delivered'
      });
    }

    // Get item details
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if return request already exists for this item
    const existingReturn = await Return.findOne({
      orderId: orderId,
      itemId: itemId,
      status: { $in: ['Pending', 'Approved', 'Processing'] }
    });

    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: 'Return request already exists for this item'
      });
    }

    // Create return request
    const returnRequest = new Return({
      orderId: orderId,
      itemId: itemId,
      userId: userId,
      productId: item.productId ? item.productId._id : item.productId,
      productName: item.productId ? item.productId.productName : 'Product Name',
      productImage: item.productId ? item.productId.mainImage : null,
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      reason: reason || 'Customer requested return',
      status: 'Pending'
    });

    await returnRequest.save();

    res.json({
      success: true,
      message: 'Return Request Sent for approval'
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