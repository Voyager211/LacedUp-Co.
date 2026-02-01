const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const Address = require('../../models/Address');
const User = require('../../models/User');
const Return = require('../../models/Return');
const orderService = require('../../services/orderService');
const walletService = require('../../services/paymentProviders/walletService');
const { paypalClient } = require('../../services/paymentProviders/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const razorpayService = require('../../services/paymentProviders/razorpay');
const getPagination = require('../../utils/pagination');

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



// Get all orders for user
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    const page = 1;
    const limit = 4;

    const filter = { user: userId };

    const queryBuilder = Order.find(filter)
      .populate('items.productId', 'productName mainImage')
      .sort({ createdAt: -1 });

    const { data: orders, totalPages } = await getPagination(
      queryBuilder,
      Order,
      filter,
      page,
      limit
    );

    // ✅ ADD: Get total orders count
    const totalOrders = await Order.countDocuments(filter);

    console.log('Order listing debug:', {
      totalOrders: orders.length,
      totalPages,
      totalOrdersCount: totalOrders
    });

    // ✅ Calculate pagination variables for shop-style pagination
    const currentPage = page;
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const prevPage = currentPage - 1;
    const nextPage = currentPage + 1;
    
    // Generate page numbers (show up to 5 pages around current page)
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    res.render('user/orders', {
      user,
      orders,
      currentPage,
      totalPages,
      hasPrevPage,
      hasNextPage,
      prevPage,
      nextPage,
      pageNumbers,
      totalOrders, // ✅ NEW: Add total orders count
      title: 'My Orders',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      cancellationReasons: getCancellationReasonsArray(),
      returnReasons: getReturnReasonsArray()
    });

  } catch (error) {
    console.error('Error loading orders: ', error);
    res.status(500).render('errors/server-error', {
      message: 'Error loading orders',
      error: error.message,
      title: 'Error',
      layout: 'user/layouts/user-layout',
      active: 'orders',
      user: null,
      totalOrders: 0, // ✅ NEW: Add default value for error case
      cancellationReasons: CANCELLATION_REASONS,
      returnReasons: RETURN_REASONS
    });
  }
};



const getUserOrdersPaginated = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const statusFilter = req.query.status || '';
    const searchQuery = req.query.search || '';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const filter = { user: userId };

    // ✅ CASE 1: NO search and NO filter - Use efficient database pagination
    if (!searchQuery && !statusFilter) {
      const queryBuilder = Order.find(filter)
        .populate({
          path: 'items.productId',
          select: 'productName mainImage brand',
          populate: {
            path: 'brand',
            select: 'name'
          }
        })
        .sort({ createdAt: -1 });

      const { data: orders, totalPages } = await getPagination(
        queryBuilder,
        Order,
        filter,
        page,
        limit
      );

      const currentPage = page;
      const hasPrevPage = currentPage > 1;
      const hasNextPage = currentPage < totalPages;
      const prevPage = currentPage - 1;
      const nextPage = currentPage + 1;

      // ✅ ADD: Generate page numbers
      const pageNumbers = generatePageNumbers(currentPage, totalPages);

      return res.json({
        success: true,
        data: {
          orders,
          currentPage,
          totalPages,
          hasPrevPage,
          hasNextPage,
          prevPage,
          nextPage,
          pageNumbers, // ✅ NEW
          totalOrders: await Order.countDocuments(filter),
          filters: { status: '', search: '' }
        }
      });
    }

    // ✅ CASE 2: Search OR Filter active - Fetch ALL orders, then filter in memory
    const allOrders = await Order.find(filter)
      .populate({
        path: 'items.productId',
        select: 'productName mainImage brand',
        populate: {
          path: 'brand',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 })
      .lean();

    let filteredOrders = allOrders;

    // ✅ Apply search filter
    if (searchQuery) {
      filteredOrders = filteredOrders.filter(order => {
        const searchLower = searchQuery.toLowerCase();

        // Check order ID
        const orderIdMatch = order.orderId.toLowerCase().includes(searchLower);

        // Check product names
        const productMatch = order.items.some(item => {
          const productName = item.productId?.productName;
          return productName && productName.toLowerCase().includes(searchLower);
        });

        // Check brand names
        const brandMatch = order.items.some(item => {
          const brandName = item.productId?.brand?.name;
          return brandName && brandName.toLowerCase().includes(searchLower);
        });

        return orderIdMatch || productMatch || brandMatch;
      });
    }

    // ✅ Apply status filter
    if (statusFilter) {
      filteredOrders = filteredOrders.map(order => {
        // Filter items by status
        const filteredItems = order.items.filter(item => item.status === statusFilter);

        // Only return order if it has items matching the status
        if (filteredItems.length > 0) {
          return {
            ...order,
            items: filteredItems
          };
        }
        return null;
      }).filter(order => order !== null);
    }

    // ✅ Calculate pagination for filtered results
    const totalFilteredOrders = filteredOrders.length;
    const totalPages = Math.ceil(totalFilteredOrders / limit) || 1;
    const currentPage = Math.min(page, totalPages); // Prevent requesting page beyond available
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const prevPage = currentPage - 1;
    const nextPage = currentPage + 1;

    // ✅ ADD: Generate page numbers
    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    // ✅ Paginate the filtered results
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        orders: paginatedOrders,
        currentPage,
        totalPages,
        hasPrevPage,
        hasNextPage,
        prevPage,
        nextPage,
        pageNumbers, // ✅ NEW
        totalOrders: totalFilteredOrders,
        filters: { 
          status: statusFilter,
          search: searchQuery 
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

// Helper function to generate page numbers
function generatePageNumbers(currentPage, totalPages) {
  const pageNumbers = [];
  const maxPagesToShow = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
  
  if (endPage - startPage + 1 < maxPagesToShow) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }
  
  return pageNumbers;
}


const searchOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const searchTerm = req.query.q || '';

    if (!searchTerm) {
      return res.json({
        success: false,
        message: 'Search term required'
      });
    }

    const orders = await Order.find({ user: userId})
    .populate({
        path: 'items.productId',
        select: 'productName mainImage brand',
        populate: {
          path: 'brand',
          select: 'name'
        }
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    const filteredOrders = orders.filter(order => {
      const searchLower = searchTerm.toLowerCase();

      const orderIdMatch = order.orderId.toLowerCase().includes(searchLower);

      const productMatch = order.items.some(item => {
        const productName = item.productId?.productName;
        return productName && productName.toLowerCase().includes(searchLower);
      });

      const brandMatch = order.items.some(item => {
        const brandName = item.productId?.brand?.name;
        return brandName && brandName.toLowerCase().includes(searchLower);
      });

      return orderIdMatch || productMatch || brandMatch;
    });

    res.json({
      success: true,
      data: { 
        orders: filteredOrders,
        totalOrders: filteredOrders.length  // ✅ ADD THIS
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};
 


// Get order details
const getOrderDetails = async (req, res) => {
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

    // ✅ NEW: Add transaction ID for retry functionality
    if (order.status === 'Pending' && order.paymentStatus === 'Pending') {
      try {
        const transactionService = require('../../services/transactionService');
        const transactions = await transactionService.getUserTransactions(userId, {
          orderId: orderId,
          status: 'FAILED',
          limit: 1
        });
        
        if (transactions && transactions.length > 0) {
          order.transactionId = transactions[0].transactionId;
          order.canRetry = ['upi', 'paypal'].includes(order.paymentMethod);
        }
      } catch (error) {
        console.error('Error fetching transaction for order:', order.orderId, error);
      }
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




// Cancel entire order
const cancelOrder = async (req, res) => {
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
const cancelItem = async (req, res) => {
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
const requestOrderReturn = async (req, res) => {
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
const requestItemReturn = async (req, res) => {
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
const downloadInvoice = async (req, res) => {
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
                    ${order.productDiscount > 0 ? `
                    <tr>
                        <td>Product Discount:</td>
                        <td class="text-right">-₹${order.productDiscount.toLocaleString('en-IN')}</td>
                    </tr>
                    ` : ''}
                    ${order.couponDiscount > 0 ? `
                    <tr>
                        <td>Coupon Discount${order.couponCode ? ` (${order.couponCode})` : ''}:</td>
                        <td class="text-right">-₹${order.couponDiscount.toLocaleString('en-IN')}</td>
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

module.exports = {
  getUserOrders,
  getUserOrdersPaginated,
  searchOrders,
  getOrderDetails,
  cancelOrder,
  cancelItem,
  requestOrderReturn,
  requestItemReturn,
  downloadInvoice
};
