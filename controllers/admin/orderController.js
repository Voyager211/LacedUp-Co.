const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');

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
      orderItems: paginatedItems, // Changed from 'orders' to 'orderItems'
      orders: [], // Keep empty for backward compatibility
      currentPage: page,
      totalPages,
      totalOrders,
      totalItems, // Total individual items
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
      layout: 'admin/layout'
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
      return res.status(404).render('admin/order-details', {
        title: 'Order Not Found',
        order: null,
        error: 'Order not found',
        layout: 'admin/layout'
      });
    }

    // Extract the specific address from the address array using addressIndex
    if (order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
      const addressIndex = order.deliveryAddress.addressIndex;
      const specificAddress = order.deliveryAddress.addressId.address[addressIndex];
      
      if (specificAddress) {
        // Replace the deliveryAddress with the actual address data for easier access in the template
        order.deliveryAddress = {
          ...order.deliveryAddress,
          ...specificAddress
        };
      }
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
          itemName: null,
          itemId: null
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
      });
    }

    // Sort comprehensive history by date (newest first)
    comprehensiveStatusHistory.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Add the comprehensive status history to the order object
    order.comprehensiveStatusHistory = comprehensiveStatusHistory;

    res.render('admin/order-details', {
      title: `Order Details - ${orderId}`,
      order,
      layout: 'admin/layout'
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/order-details', {
      title: 'Error',
      order: null,
      error: 'Error loading order details',
      layout: 'admin/layout'
    });
  }
};

// Get allowed status transitions based on current status
const getAllowedStatusTransitions = (currentStatus) => {
  const transitions = {
    'Pending': ['Processing', 'Cancelled'],
    'Processing': ['Shipped', 'Cancelled'],
    'Shipped': ['Delivered'],
    'Delivered': ['Returned'], // Special case for return request
    'Cancelled': [], // No transitions allowed
    'Partially Cancelled': ['Cancelled'], // Can only fully cancel
    'Returned': [] // No transitions allowed
  };
  
  return transitions[currentStatus] || [];
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const currentStatus = order.status;
    const allowedTransitions = getAllowedStatusTransitions(currentStatus);

    // Validate status transition
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}. Allowed transitions: ${allowedTransitions.join(', ') || 'None'}`
      });
    }

    // Use the model's updateStatus method for consistency
    await order.updateStatus(status, notes || `Status updated to ${status} by admin`);

    // Update payment status if order is delivered and payment method is COD
    if (status === 'Delivered' && order.paymentMethod === 'cod') {
      order.paymentStatus = 'Completed';
      await order.save();
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        allowedTransitions: getAllowedStatusTransitions(status)
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status'
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

    const validPaymentStatuses = ['Pending', 'Completed', 'Failed', 'Refunded'];
    
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

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Validate status transition for individual item
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Use the model's updateItemStatus method
    await order.updateItemStatus(itemId, status, notes || `Item status updated to ${status} by admin`);

    res.json({
      success: true,
      message: `Item status updated to ${status}`,
      order: {
        orderId: order.orderId,
        status: order.status,
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

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Use the model's cancelItem method
    await order.cancelItem(itemId, reason || 'Item cancelled by admin');

    res.json({
      success: true,
      message: 'Item cancelled successfully',
      order: {
        orderId: order.orderId,
        status: order.status
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

// Return individual item
exports.returnItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Use the model's returnItem method
    await order.returnItem(itemId, reason || 'Item returned by admin');

    res.json({
      success: true,
      message: 'Item return processed successfully',
      order: {
        orderId: order.orderId,
        status: order.status
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