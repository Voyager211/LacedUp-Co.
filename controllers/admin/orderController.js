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
const { paginateAggregate } = require('../../utils/paginateAggregate');

const validateTransitionAndGetOrder = async (orderId, newStatus, isItem = false, itemId = null) => {
  const order = await Order.findOne({ orderId });
  if (!order) {
    throw new Error('Order not found');
  }
  
  let currentStatus;
  if (isItem) {
    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found');
    currentStatus = item.status;
  } else {
    currentStatus = order.status;
  }
  
  const { isValidStatusTransition, getValidTransitions } = require('../../services/orderService');
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    const validTransitions = getValidTransitions(currentStatus);
    throw new Error(`Invalid status transition from '${currentStatus}' to '${newStatus}'. Valid transitions: ${validTransitions.join(', ')}`);
  }
  
  return { order, currentStatus };
};

const getStatusColor = (status) => {
  const colorMap = {
    'Pending': 'warning',
    'Processing': 'info',
    'Shipped': 'primary',
    'Delivered': 'success',
    'Processing Return': 'warning',
    'Returned': 'secondary',
    'Cancelled': 'danger',
    'Partially Delivered': 'primary',
    'Partially Cancelled': 'danger',
    'Partially Returned': 'secondary'
  };
  return colorMap[status] || 'secondary';
};

const getPaymentStatusColor = (status) => {
  const colorMap = {
    'Pending': 'warning',
    'Completed': 'success',
    'Failed': 'danger',
    'Refunded': 'info',
    'Cancelled': 'secondary',
    'Partially Completed': 'primary',
    'Partially Refunded': 'secondary'
  };
  return colorMap[status] || 'secondary';
};

// Helper function to build aggregation pipeline
function buildOrderItemsPipeline(filters) {
  const pipeline = [];
  
  console.log('🔍 Building pipeline with filters:', filters);

  // Step 1: Initial match for order-level filters ONLY (NO SEARCH HERE!)
  const orderMatch = {};
  
  if (filters.paymentMethod) {
    orderMatch.paymentMethod = filters.paymentMethod;
  }
  
  if (filters.paymentStatus) {
    orderMatch.paymentStatus = filters.paymentStatus;
  }

  // ✅ CRITICAL FIX: Removed search from initial match!
  // Search will ONLY be applied after lookups in the enhanced search stage

  if (Object.keys(orderMatch).length > 0) {
    pipeline.push({ $match: orderMatch });
    console.log('📍 Added initial order match (no search):', orderMatch);
  }

  // Step 2: User lookup
  pipeline.push({
    $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'user'
    }
  });
  pipeline.push({ $unwind: '$user' });

  // Step 3: Address lookup  
  pipeline.push({
    $lookup: {
      from: 'addresses',
      localField: 'deliveryAddress.addressId',
      foreignField: '_id',
      as: 'deliveryAddressDoc'
    }
  });

  // Step 4: Unwind items (this creates the flattened structure)
  pipeline.push({ $unwind: '$items' });

  // Step 5: Product lookup
  pipeline.push({
    $lookup: {
      from: 'products',
      localField: 'items.productId',
      foreignField: '_id',
      as: 'items.productId'
    }
  });
  pipeline.push({
    $unwind: {
      path: '$items.productId',
      preserveNullAndEmptyArrays: true
    }
  });

  // ✅ ENHANCED SEARCH: This is now the ONLY search stage (after all lookups)
  if (filters.search && filters.search.trim() !== '') {
    // ✅ FIX: Handle '#' prefix in order ID search
    let searchTerm = filters.search.trim();
    let orderIdSearchTerm = searchTerm.startsWith('#') ? searchTerm.substring(1) : searchTerm;
    
    const searchMatch = {
      $or: [
        { orderId: { $regex: orderIdSearchTerm, $options: 'i' } }, // ✅ Use cleaned term for orderId
        { 'user.name': { $regex: searchTerm, $options: 'i' } },
        { 'user.email': { $regex: searchTerm, $options: 'i' } },
        { 'items.productId.productName': { $regex: searchTerm, $options: 'i' } },
        { 'items.sku': { $regex: searchTerm, $options: 'i' } }
      ]
    };
    
    pipeline.push({ $match: searchMatch });
    console.log('🔍 Added enhanced search match for:', searchTerm);
    console.log('🔍 OrderId search term (# stripped):', orderIdSearchTerm);
  }

  // Step 6: Item-level status filtering
  if (filters.status) {
    const statusMatch = { 'items.status': filters.status };
    pipeline.push({ $match: statusMatch });
    console.log('📊 Added status match:', statusMatch);
  }

  // Step 7: Project the final structure
  pipeline.push({
    $project: {
      orderId: 1,
      orderDate: '$createdAt',
      paymentMethod: 1,
      paymentStatus: 1,
      orderStatus: '$status',
      totalAmount: 1,
      user: {
        name: '$user.name',
        email: '$user.email'
      },
      deliveryAddress: {
        $cond: {
          if: { $gt: [{ $size: '$deliveryAddressDoc' }, 0] },
          then: {
            $arrayElemAt: [
              { $arrayElemAt: ['$deliveryAddressDoc.address', '$deliveryAddress.addressIndex'] },
              0
            ]
          },
          else: {
            name: 'Address not found',
            city: 'N/A',
            state: 'N/A',
            phone: 'N/A'
          }
        }
      },
      itemId: '$items._id',
      productId: '$items.productId',
      productName: {
        $ifNull: ['$items.productId.productName', 'Product']
      },
      productImage: '$items.productId.mainImage',
      sku: '$items.sku',
      size: '$items.size',
      quantity: '$items.quantity',
      price: '$items.price',
      totalPrice: '$items.totalPrice',
      status: { $ifNull: ['$items.status', '$status'] },
      statusHistory: { $ifNull: ['$items.statusHistory', []] },
      cancellationReason: '$items.cancellationReason',
      returnReason: '$items.returnReason',
      cancellationDate: '$items.cancellationDate',
      returnRequestDate: '$items.returnRequestDate'
    }
  });

  // Step 8: Sorting
  const sortObj = {};
  sortObj[filters.sortBy === 'createdAt' ? 'orderDate' : filters.sortBy] = 
    filters.sortOrder === 'desc' ? -1 : 1;
  pipeline.push({ $sort: sortObj });

  console.log('✅ Final pipeline length:', pipeline.length);
  console.log('🎯 Search will now work for customer names, product names, order IDs, and SKUs!');
  return pipeline;
}


// Helper functions for statistics
async function getOrderItemStatistics() {
  const stats = await Order.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.status',
        count: { $sum: 1 }
      }
    }
  ]);
  return stats;
}

async function getTodayOrdersCount() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return await Order.countDocuments({
    createdAt: { $gte: today }
  });
}

// Get all orders for admin (showing individual items)
exports.getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    
    // Get filter parameters
    const status = req.query.status || '';
    const paymentMethod = req.query.paymentMethod || '';
    const paymentStatus = req.query.paymentStatus || '';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build aggregation pipeline
    const pipeline = buildOrderItemsPipeline({
      status,
      paymentMethod,
      paymentStatus,
      search,
      sortBy,
      sortOrder
    });

    

    // Use new paginateAggregate utility
    const result = await paginateAggregate(Order, pipeline, page, limit);

    const { data: orderItems, totalPages, count } = result;

    // Get statistics (separate aggregation for performance)
    const [orderStats, todayOrders] = await Promise.all([
      getOrderItemStatistics(),
      getTodayOrdersCount()
    ]);

    const totalOrders = await Order.countDocuments();

    res.render('admin/orders', {
      title: 'Order Management',
      orderItems,
      currentPage: page,
      totalPages,
      totalOrders,
      totalItems: count,
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
      paymentStatuses: getPaymentStatusArray()
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('admin/orders', {
      title: 'Order Management',
      orderItems: [],
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


// Get allowed status transitions based on current status
const getAllowedStatusTransitions = (currentStatus) => {
  return orderService.getValidTransitions(currentStatus);
};

// Update order status
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log('🔍 DEBUG: Accessing order details for:', orderId);

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
      console.log('❌ Order not found:', orderId);
      return res.status(404).render('errors/404', {
        pageTitle: 'Order Not Found',
        message: 'The requested order could not be found.',
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
          notes: statusEntry.notes || `Order status changed to ${statusEntry.status}`, // ✅ Fixed
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
              notes: statusEntry.notes || `${productName} (Size: ${item.size}) status changed to ${statusEntry.status}`, // ✅ Fixed
              itemName: `${productName} (Size: ${item.size})`, // ✅ Fixed
              itemId: item._id // ✅ Fixed
            });
          });
        }
      });
    }

    comprehensiveStatusHistory.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    order.comprehensiveStatusHistory = comprehensiveStatusHistory;

    // Get valid status transitions for current order
    const { getValidTransitions } = require('../../services/orderService');
    const allValidTransitions = getValidTransitions(order.status);
    
    // Filter out 'Returned' status - only available through return management
    const validTransitions = allValidTransitions.filter(status => status !== 'Returned');

    // ✅ ENHANCED: Add item-level transition debugging
    order.items.forEach((item, index) => {
      const itemTransitions = getValidTransitions(item.status);
      console.log(`🔍 DEBUG - Item ${index} (${item.status}) transitions:`, itemTransitions); // ✅ Fixed
    });

    res.render('admin/order-details', {
      title: `Order Details - ${orderId}`, // ✅ Fixed
      order,
      orderStatuses: getOrderStatusArray(),
      paymentStatuses: getPaymentStatusArray(),
      cancellationReasons: getCancellationReasonsArray(),
      returnReasons: getReturnReasonsArray(),
      ORDER_STATUS: ORDER_STATUS, // ✅ Fixed
      PAYMENT_STATUS: PAYMENT_STATUS, // ✅ Fixed
      validTransitions: validTransitions,
      getStatusColor,
      getPaymentStatusColor,
      layout: 'admin/layout'
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    
    res.status(500).render('errors/404', {
      pageTitle: 'Server Error',
      message: 'An error occurred while loading the order details.',
      layout: 'admin/layout'
    });
  }
};



exports.getOrderDetailsJSON = async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: 'Order not found'
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

    // ✅ NEW: Get valid transitions for current order status
    const validTransitions = await orderService.getValidTransitions(order.status);


    // ✅ Return JSON response (not HTML)
    res.json({
      success: true,
      order: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        user: order.user,
        deliveryAddress: order.deliveryAddress,
        items: order.items.map(item => ({
          _id: item._id,
          productId: item.productId,
          productName: item.productId ? item.productId.productName : 'Product',
          sku: item.sku,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice,
          status: item.status,
          paymentStatus: item.paymentStatus
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      },
      validTransitions: validTransitions // ✅ Include valid transitions
    });

  } catch (error) {
    console.error('Error fetching order details JSON:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading order details'
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

// updateOrderStatus function with transition validation
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, action } = req.body;

    // Handle different actions
    if (action === 'cancel') {
      return exports.cancelOrder(req, res);
    } else if (action === 'return') {
      return exports.returnOrder(req, res);
    }

    // Get current order to validate transition
    const currentOrder = await Order.findOne({ orderId });
    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Validate status transition using OrderService
    const { isValidStatusTransition } = require('../../services/orderService');
    
    if (!isValidStatusTransition(currentOrder.status, status)) {
      const { getValidTransitions } = require('../../services/orderService');
      const validTransitions = getValidTransitions(currentOrder.status);
      
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from '${currentOrder.status}' to '${status}'. Valid transitions: ${validTransitions.join(', ')}`
      });
    }

    // Regular status update with validation passed
    const result = await orderService.updateOrderStatus(
      orderId, 
      status, 
      notes || `Status updated to ${status} by admin`,
      'admin'
    );

    // ✅ ENHANCED: Comprehensive response with all information needed for UI updates
    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus, // ✅ Order-level payment status
        paymentMethod: result.order.paymentMethod, // ✅ Helpful for frontend logic
        totalAmount: result.order.totalAmount,
        // ✅ ENHANCED: Complete item information for real-time badge updates
        items: result.order.items.map(item => ({
          _id: item._id,
          productName: item.productId ? item.productId.productName : 'Product',
          sku: item.sku,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice,
          status: item.status,                    // ✅ Updated item status
          paymentStatus: item.paymentStatus,      // ✅ Updated item payment status
          // ✅ Additional info for debugging/logging
          previousStatus: currentOrder.items.find(ci => ci._id.toString() === item._id.toString())?.status,
          statusChanged: currentOrder.items.find(ci => ci._id.toString() === item._id.toString())?.status !== item.status
        })),
        // ✅ ENHANCED: Status change summary for frontend
        changes: {
          previousOrderStatus: currentOrder.status,
          newOrderStatus: result.order.status,
          previousOrderPaymentStatus: currentOrder.paymentStatus,
          newOrderPaymentStatus: result.order.paymentStatus,
          orderStatusChanged: currentOrder.status !== result.order.status,
          orderPaymentStatusChanged: currentOrder.paymentStatus !== result.order.paymentStatus,
          totalItemsUpdated: result.order.items.length,
          itemsWithPaymentChanges: result.order.items.filter(item => {
            const originalItem = currentOrder.items.find(ci => ci._id.toString() === item._id.toString());
            return originalItem && originalItem.paymentStatus !== item.paymentStatus;
          }).length
        },
        // ✅ ENHANCED: Metadata for frontend processing
        updatedAt: result.order.updatedAt,
        updatedBy: 'admin'
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating order status',
      // ✅ ENHANCED: Error context for debugging
      context: {
        orderId: req.params.orderId,
        requestedStatus: req.body.status,
        timestamp: new Date().toISOString()
      }
    });
  }
};


// Update payment status
// exports.updatePaymentStatus = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { paymentStatus } = req.body;

//     const validPaymentStatuses = getPaymentStatusArray();
    
//     if (!validPaymentStatuses.includes(paymentStatus)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid payment status'
//       });
//     }

//     const order = await Order.findOne({ orderId });
    
//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: 'Order not found'
//       });
//     }

//     order.paymentStatus = paymentStatus;
//     await order.save();

//     res.json({
//       success: true,
//       message: `Payment status updated to ${paymentStatus}`,
//       order: {
//         orderId: order.orderId,
//         status: order.status,
//         paymentStatus: order.paymentStatus
//       }
//     });

//   } catch (error) {
//     console.error('Error updating payment status:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error updating payment status'
//     });
//   }
// };




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

    //  Use validation helper
    const { order } = await validateTransitionAndGetOrder(orderId, 'Processing Return', true, itemId);

    // Use OrderService to process return (creates return request)
    const result = await orderService.returnItem(
      orderId,
      itemId,
      reason || 'Item returned by admin',
      'admin'
    );

    // NO immediate stock restoration
    // Stock will be restored only when return is approved via approveReturn function

    res.json({
      success: true,
      message: result.message + ' (Stock will be restored when return is approved)',
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        returnRequestCreated: true
      }
    });

  } catch (error) {
    console.error('Error processing item return:', error);
    
    // Handle validation errors specifically
    if (error.message.includes('Invalid status transition')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
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

    //  Use validation helper for order-level validation
    const { order } = await validateTransitionAndGetOrder(orderId, 'Processing Return', false);

    // Store eligible items count for response
    const eligibleItems = order.items.filter(item => 
      item.status === ORDER_STATUS.DELIVERED || 
      item.status === ORDER_STATUS.SHIPPED
    );

    // Use OrderService to return entire order (creates return requests)
    const result = await orderService.returnOrder(
      orderId,
      reason || 'Order returned by admin'
    );

    // NO immediate stock restoration
    // Stock will be restored only when individual returns are approved

    res.json({
      success: true,
      message: result.message + ' (Stock will be restored when returns are approved)',
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        itemsAffected: eligibleItems.length,
        returnRequestsCreated: true
      }
    });

  } catch (error) {
    console.error('Error returning order:', error);
    
    // Handle validation errors specifically
    if (error.message.includes('Invalid status transition')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
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
    const limit = parseInt(req.query.limit) || 5;
    
    const status = req.query.status || '';
    const paymentMethod = req.query.paymentMethod || '';
    const paymentStatus = req.query.paymentStatus || '';
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    console.log('🚀 API called with filters:', {
      page, limit, status, paymentMethod, paymentStatus, search, sortBy, sortOrder
    });

    // Build aggregation pipeline
    const pipeline = buildOrderItemsPipeline({
      status,
      paymentMethod,
      paymentStatus,
      search,
      sortBy,
      sortOrder
    });

    // Use paginateAggregate for efficient pagination
    const result = await paginateAggregate(Order, pipeline, page, limit);
    console.log('📊 Aggregation result:', { 
      totalItems: result.count, 
      currentPage: result.currentPage || page,
      totalPages: result.totalPages,
      itemsReturned: result.data?.length || 0 
    });

    const { data: orderItems, totalPages, count } = result;

    // ✅ FIXED: Don't include system-wide statistics in filtered response
    res.json({
      success: true,
      data: {
        orderItems,
        currentPage: page,
        totalPages,
        filteredItemsCount: count, // ✅ Only the filtered count
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
    console.error('❌ Error in getFilteredOrders:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading orders',
      debug: error.message
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

exports.getSystemStatistics = async (req, res) => {
  try {
    const [orderStats, todayOrders] = await Promise.all([
      getOrderItemStatistics(),
      getTodayOrdersCount()
    ]);

    const totalOrders = await Order.countDocuments();
    
    // Get total items count (all items in system)
    const totalItemsResult = await Order.aggregate([
      { $unwind: '$items' },
      { $count: 'totalItems' }
    ]);
    const totalItems = totalItemsResult[0]?.totalItems || 0;

    res.json({
      success: true,
      statistics: {
        todayOrders,
        totalOrders, 
        totalItems,
        orderStats
      }
    });

  } catch (error) {
    console.error('Error fetching system statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
};

// Fix payment status for cancelled order
exports.fixCancelledOrderPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== ORDER_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: 'Order is not cancelled'
      });
    }

    // Fix payment statuses
    const oldOrderPaymentStatus = order.paymentStatus;
    
    if (order.paymentMethod === 'cod') {
      order.paymentStatus = PAYMENT_STATUS.CANCELLED;
    } else {
      order.paymentStatus = order.paymentStatus === PAYMENT_STATUS.COMPLETED 
        ? PAYMENT_STATUS.REFUNDED 
        : PAYMENT_STATUS.CANCELLED;
    }

    order.items.forEach(item => {
      if (item.status === ORDER_STATUS.CANCELLED) {
        const oldItemPaymentStatus = item.paymentStatus;
        
        if (order.paymentMethod === 'cod') {
          item.paymentStatus = PAYMENT_STATUS.CANCELLED;
        } else {
          item.paymentStatus = item.paymentStatus === PAYMENT_STATUS.COMPLETED 
            ? PAYMENT_STATUS.REFUNDED 
            : PAYMENT_STATUS.CANCELLED;
        }
      }
    });

    await order.save();

    res.json({
      success: true,
      message: 'Payment statuses fixed successfully',
      changes: {
        orderPaymentStatus: `${oldOrderPaymentStatus} → ${order.paymentStatus}`,
        itemsFixed: order.items.length
      },
      order: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        items: order.items.map(item => ({
          _id: item._id,
          status: item.status,
          paymentStatus: item.paymentStatus
        }))
      }
    });

  } catch (error) {
    console.error('Error fixing cancelled order payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing payment status'
    });
  }
};
