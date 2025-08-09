const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');
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


// Get all orders for admin (showing individual items)
exports.getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Increased limit since we're showing individual items
    
    // Get filter parameters
    const status = req.query.status || '';
    const paymentMethod = req.query.paymentMethod || '';
    const paymentStatus = req.query.paymentStatus || '';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build filter query
    let filterQuery = {};
    
    if (paymentMethod) {
      filterQuery.paymentMethod = paymentMethod;
    }
    
    if (paymentStatus) {
      filterQuery.paymentStatus = paymentStatus;
    }

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'deliveryAddress.name': { $regex: search, $options: 'i' } },
        { 'deliveryAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get all orders first (without pagination to flatten items)
    const allOrders = await Order.find(filterQuery)
      .populate({
        path: 'user',
        select: 'name email'
      })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage'
      })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      })
      .sort(sortObj)
      .lean();

    // Flatten orders to individual items (similar to user side)
    const orderItems = [];
    
    allOrders.forEach(order => {
      // Get the actual delivery address from the populated address document
      let actualDeliveryAddress = null;
      if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
        const addressIndex = order.deliveryAddress.addressIndex;
        actualDeliveryAddress = order.deliveryAddress.addressId.address[addressIndex];
      }

      order.items.forEach(item => {
        orderItems.push({
          // Order information
          orderId: order.orderId,
          orderDate: order.createdAt,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.status,
          totalAmount: order.totalAmount,
          user: order.user,
          deliveryAddress: actualDeliveryAddress || {
            name: 'Address not found',
            city: 'N/A',
            state: 'N/A',
            phone: 'N/A'
          },
          
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
          status: item.status || order.status, // Use item status if available, otherwise order status
          statusHistory: item.statusHistory || [],
          cancellationReason: item.cancellationReason,
          returnReason: item.returnReason,
          cancellationDate: item.cancellationDate,
          returnRequestDate: item.returnRequestDate
        });
      });
    });

    // Apply status filter to individual items if specified
    let filteredOrderItems = orderItems;
    if (status) {
      filteredOrderItems = orderItems.filter(item => item.status === status);
    }

    // Apply pagination to the flattened items
    const totalItems = filteredOrderItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;
    const paginatedItems = filteredOrderItems.slice(skip, skip + limit);

    // Get order statistics (based on individual items)
    const itemStats = {};
    orderItems.forEach(item => {
      if (itemStats[item.status]) {
        itemStats[item.status]++;
      } else {
        itemStats[item.status] = 1;
      }
    });

    const orderStats = Object.keys(itemStats).map(status => ({
      _id: status,
      count: itemStats[status]
    }));

    // Get recent orders count (unique orders, not items)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    // Get total unique orders count
    const totalOrders = allOrders.length;

    res.render('admin/orders', {
      title: 'Order Management',
      orderItems: paginatedItems,
      orders: [], 
      currentPage: page,
      totalPages,
      totalOrders,
      totalItems, 
      orderStats,
      todayOrders,
      filters: {
        status,
        paymentMethod,
        paymentStatus,
        search,
        sortBy,
        sortOrder
      },
      layout: 'admin/layout',
      orderStatuses: getOrderStatusArray(),
      ORDER_STATUS: ORDER_STATUS,
      PAYMENT_STATUS: PAYMENT_STATUS,
      orderStatuses: getOrderStatusArray(),
      paymentStatuses: getPaymentStatusArray()
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('admin/orders', {
      title: 'Order Management',
      orderItems: [],
      orders: [],
      currentPage: 1,
      totalPages: 1,
      totalOrders: 0,
      totalItems: 0,
      orderStats: [],
      todayOrders: 0,
      filters: {},
      error: 'Error loading orders',
      layout: 'admin/layout'
    });
  }
};

// Get single order details for admin
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log('🔍 Looking for order ID:', orderId);
    console.log('🔍 Order ID type:', typeof orderId);

    const order = await Order.findOne({ orderId })
      .populate({
        path: 'user',
        select: 'name email phone profilePhoto'
      })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages regularPrice salePrice category brand'
      })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      })
      .lean();

    if (!order) {
      console.log('❌ No order found with orderId:', orderId);
      const totalOrders = await Order.countDocuments();
      console.log('📊 Total orders in database:', totalOrders);
      // Show a few sample order IDs for comparison
      const sampleOrders = await Order.find({}, { orderId: 1 }).limit(3).lean();
      console.log('📝 Sample order IDs in database:', sampleOrders.map(o => o.orderId));

      return res.status(404).render('admin/order-details', {
        title: 'Order Not Found',
        order: null,
        error: 'Order not found',
        orderStatuses: getOrderStatusArray(),
        paymentStatuses: getPaymentStatusArray(),
        cancellationReasons: getCancellationReasonsArray(),
        returnReasons: getReturnReasonsArray(),
        ORDER_STATUS: ORDER_STATUS,
        PAYMENT_STATUS: PAYMENT_STATUS,
        layout: 'admin/layout'
      });
    }

    // Extract the specific address from the address array using addressIndex
    if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
      const addressIndex = order.deliveryAddress.addressIndex;
      const specificAddress = order.deliveryAddress.addressId.address[addressIndex];
      
      if (specificAddress) {
        order.deliveryAddress = {
          ...order.deliveryAddress,
          ...specificAddress
        };
      }
    }

    // Create comprehensive status history combining order and item level changes
    const comprehensiveStatusHistory = [];
    
    if (order.statusHistory && order.statusHistory.length > 0) {
      order.statusHistory.forEach(statusEntry => {
        comprehensiveStatusHistory.push({
          type: 'order',
          status: statusEntry.status,
          updatedAt: statusEntry.updatedAt,
          notes: statusEntry.notes || `Order status changed to ${statusEntry.status}`,
          itemName: null,
          itemId: null
        });
      });
    }

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
      });
    }

    comprehensiveStatusHistory.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    order.comprehensiveStatusHistory = comprehensiveStatusHistory;

    res.render('admin/order-details', {
      title: `Order Details - ${orderId}`,
      order,
      orderStatuses: getOrderStatusArray(),
      paymentStatuses: getPaymentStatusArray(),
      cancellationReasons: getCancellationReasonsArray(),
      returnReasons: getReturnReasonsArray(),
      ORDER_STATUS: ORDER_STATUS,
      PAYMENT_STATUS: PAYMENT_STATUS,
      layout: 'admin/layout'
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/order-details', {
      title: 'Error',
      order: null,
      error: 'Error loading order details',
      orderStatuses: getOrderStatusArray(),
      paymentStatuses: getPaymentStatusArray(),
      cancellationReasons: getCancellationReasonsArray(),
      returnReasons: getReturnReasonsArray(),
      ORDER_STATUS: ORDER_STATUS,
      PAYMENT_STATUS: PAYMENT_STATUS,
      layout: 'admin/layout'
    });
  }
};


// Get allowed status transitions based on current status
const getAllowedStatusTransitions = (currentStatus) => {
  return orderService.getValidTransitions(currentStatus);
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, action } = req.body;

    // Handle different actions
    if (action === 'cancel') {
      // Use cancelOrder function instead
      return exports.cancelOrder(req, res);
    } else if (action === 'return') {
      // Use returnOrder function instead  
      return exports.returnOrder(req, res);
    }

    // ✅ FIXED: Regular status update - OrderService handles COD completion automatically
    const result = await orderService.updateOrderStatus(
      orderId, 
      status, 
      notes || `Status updated to ${status} by admin`,
      'admin'
    );

    // ✅ REMOVED: Redundant COD payment status logic (OrderService already handles this)
    // The OrderService.updateOrderStatus function already includes:
    // - Auto COD completion when status = DELIVERED
    // - Payment status updates for all items
    // - Status history logging

    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus,
        // ✅ ADD: Include items for frontend updates
        items: result.order.items.map(item => ({
          _id: item._id,
          status: item.status,
          paymentStatus: item.paymentStatus
        }))
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating order status'
    });
  }
};



// Get allowed status transitions for a specific order
exports.getAllowedTransitions = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const allowedTransitions = getAllowedStatusTransitions(order.status);

    res.json({
      success: true,
      currentStatus: order.status,
      allowedTransitions
    });

  } catch (error) {
    console.error('Error fetching allowed transitions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allowed transitions'
    });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    const validPaymentStatuses = getPaymentStatusArray();
    
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.paymentStatus = paymentStatus;
    await order.save();

    res.json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      order: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus
      }
    });

  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment status'
    });
  }
};

// Update individual item status
exports.updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, notes } = req.body;

    // Verify order exists first
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Use OrderService to update item status (includes validation)
    const result = await orderService.updateItemStatus(
      orderId,
      itemId,
      status,
      notes || `Item status updated to ${status} by admin`
    );

    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        itemStatus: status
      }
    });

  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating item status'
    });
  }
};

// Cancel individual item
exports.cancelItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    // Validate cancel reason
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a cancellation reason'
      });
    }

    // Validate reason is from allowed enum values
    const validReasons = getCancellationReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation reason provided'
      });
    }
    
    // Verify order exists first
    const order = await Order.findOne({ orderId });
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

    // Use OrderService to cancel item
    const result = await orderService.cancelItem(
      orderId,
      itemId,
      reason || 'Item cancelled by admin',
      'admin'
    );

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
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status
      }
    });

  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error cancelling item'
    });
  }
};

// Cancel Entire Order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    // Validate cancel reason
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a cancellation reason'
      });
    }

    // Validate reason is from allowed enum values
    const validReasons = getCancellationReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation reason provided'
      });
    }

    // Use OrderService to cancel order
    const result = await orderService.cancelOrder(
      orderId,
      reason || 'Order cancelled by admin',
      'admin'
    );

    // Restore stock for all cancelled items
    for (const item of result.order.items) {
      if (item.status === ORDER_STATUS.CANCELLED) {
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
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status
      }
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error cancelling order'
    });
  }
};

// Return individual item
exports.returnItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    // Return reason validation
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a return reason'
      });
    }

    // Validate reason is from allowed enum values
    const validReasons = getReturnReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid return reason provided'
      });
    }

    // Verify order exists first
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get item details before return for stock restoration
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Use OrderService to process return
    const result = await orderService.returnItem(
      orderId,
      itemId,
      reason || 'Item returned by admin',
      'admin'
    );

    // Note: Stock restoration for returns might be handled differently
    // You may want to restore stock only when return is approved, not requested

    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status
      }
    });

  } catch (error) {
    console.error('Error processing item return:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing item return'
    });
  }
};

// Return entire order
exports.returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    // Return reason validation
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a return reason'
      });
    }

    // Validate reason is from allowed enum values
    const validReasons = getReturnReasonsArray();
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid return reason provided'
      });
    }

    // Verify order exists first
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Store item details before return for potential stock restoration
    const deliveredItems = order.items.filter(item => item.status === ORDER_STATUS.DELIVERED);

    // Use OrderService to return entire order
    const result = await orderService.returnOrder(
      orderId,
      reason || 'Order returned by admin'
    );

    // Restore stock for all returned items
    // Note: You might want to handle this differently - perhaps only restore stock 
    // when return is approved, not when return is initiated
    for (const item of deliveredItems) {
      const product = await Product.findById(item.productId);
      if (product) {
        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variant) {
          variant.stock += item.quantity;
          await product.save();
        }
      }
    }

    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        itemsAffected: result.itemsAffected
      }
    });

  } catch (error) {
    console.error('Error returning order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error returning order'
    });
  }
};


// Get order statistics for dashboard
exports.getOrderStatistics = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const stats = await Promise.all([
      // Today's orders
      Order.countDocuments({
        createdAt: { $gte: startOfDay }
      }),
      
      // This week's orders
      Order.countDocuments({
        createdAt: { $gte: startOfWeek }
      }),
      
      // This month's orders
      Order.countDocuments({
        createdAt: { $gte: startOfMonth }
      }),
      
      // Total orders
      Order.countDocuments(),
      
      // Revenue statistics
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            averageOrderValue: { $avg: '$totalAmount' }
          }
        }
      ]),
      
      // Status distribution
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      statistics: {
        todayOrders: stats[0],
        weekOrders: stats[1],
        monthOrders: stats[2],
        totalOrders: stats[3],
        revenue: stats[4][0] || { totalRevenue: 0, averageOrderValue: 0 },
        statusDistribution: stats[5]
      }
    });

  } catch (error) {
    console.error('Error fetching order statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order statistics'
    });
  }
};

// API endpoint for filtered orders (for dynamic updates)
exports.getFilteredOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Get filter parameters
    const status = req.query.status || '';
    const paymentMethod = req.query.paymentMethod || '';
    const paymentStatus = req.query.paymentStatus || '';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build filter query
    let filterQuery = {};
    
    if (paymentMethod) {
      filterQuery.paymentMethod = paymentMethod;
    }
    
    if (paymentStatus) {
      filterQuery.paymentStatus = paymentStatus;
    }

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'deliveryAddress.name': { $regex: search, $options: 'i' } },
        { 'deliveryAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get all orders first (without pagination to flatten items)
    const allOrders = await Order.find(filterQuery)
      .populate({
        path: 'user',
        select: 'name email'
      })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage'
      })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      })
      .sort(sortObj)
      .lean();

    // Flatten orders to individual items
    const orderItems = [];
    
    allOrders.forEach(order => {
      // Get the actual delivery address from the populated address document
      let actualDeliveryAddress = null;
      if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
        const addressIndex = order.deliveryAddress.addressIndex;
        actualDeliveryAddress = order.deliveryAddress.addressId.address[addressIndex];
      }

      order.items.forEach(item => {
        orderItems.push({
          // Order information
          orderId: order.orderId,
          orderDate: order.createdAt,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.status,
          totalAmount: order.totalAmount,
          user: order.user,
          deliveryAddress: actualDeliveryAddress || {
            name: 'Address not found',
            city: 'N/A',
            state: 'N/A',
            phone: 'N/A'
          },
          
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
          statusHistory: item.statusHistory || [],
          cancellationReason: item.cancellationReason,
          returnReason: item.returnReason,
          cancellationDate: item.cancellationDate,
          returnRequestDate: item.returnRequestDate
        });
      });
    });

    // Apply status filter to individual items if specified
    let filteredOrderItems = orderItems;
    if (status) {
      filteredOrderItems = orderItems.filter(item => item.status === status);
    }

    // Apply pagination to the flattened items
    const totalItems = filteredOrderItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;
    const paginatedItems = filteredOrderItems.slice(skip, skip + limit);

    // Get order statistics (based on individual items)
    const itemStats = {};
    orderItems.forEach(item => {
      if (itemStats[item.status]) {
        itemStats[item.status]++;
      } else {
        itemStats[item.status] = 1;
      }
    });

    const orderStats = Object.keys(itemStats).map(status => ({
      _id: status,
      count: itemStats[status]
    }));

    // Get recent orders count (unique orders, not items)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    // Get total unique orders count
    const totalOrders = allOrders.length;

    res.json({
      success: true,
      data: {
        orderItems: paginatedItems,
        currentPage: page,
        totalPages,
        totalOrders,
        totalItems,
        orderStats,
        todayOrders,
        filters: {
          status,
          paymentMethod,
          paymentStatus,
          search,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error fetching filtered orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading orders'
    });
  }
};

// Export orders data (CSV)
exports.exportOrders = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    let filterQuery = {};
    
    if (startDate && endDate) {
      filterQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      filterQuery.status = status;
    }

    const orders = await Order.find(filterQuery)
      .populate('user', 'name email')
      .populate('items.productId', 'productName')
      .sort({ createdAt: -1 })
      .lean();

    // Generate CSV content
    const csvHeaders = [
      'Order ID',
      'Customer Name',
      'Customer Email',
      'Order Date',
      'Status',
      'Payment Method',
      'Payment Status',
      'Total Amount',
      'Items Count',
      'Delivery City'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    orders.forEach(order => {
      const row = [
        order.orderId,
        order.user?.name || 'N/A',
        order.user?.email || 'N/A',
        new Date(order.createdAt).toLocaleDateString(),
        order.status,
        order.paymentMethod,
        order.paymentStatus,
        order.totalAmount,
        order.totalItemCount,
        order.deliveryAddress?.city || 'N/A'
      ];
      csvContent += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting orders'
    });
  }
};