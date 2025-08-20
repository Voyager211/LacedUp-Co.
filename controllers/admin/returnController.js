const Return = require('../../models/Return');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Wallet = require('../../models/Wallet');
const orderService = require('../../services/orderService');
const {
  ORDER_STATUS,
  RETURN_STATUS,
  PAYMENT_STATUS,
  getCancellationReasonsArray,
  getReturnReasonsArray,
  getOrderStatusArray,
  getPaymentStatusArray
} = require('../../constants/orderEnums');

const REFUND_STATUS = {
  PENDING: 'Pending',
  PROCESSED: 'Processed', 
  FAILED: 'Failed'
};

// Get all return requests for admin
exports.getAllReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    
    // Get filter parameters
    const status = req.query.status || '';
    const refundStatus = req.query.refundStatus || '';
    const search = req.query.search || '';
    const dateRange = req.query.dateRange || '';
    const sortBy = req.query.sortBy || 'requestDate';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build filter query
    let filterQuery = {};
    
    if (status) {
      filterQuery.status = status;
    }
    
    if (refundStatus) {
      filterQuery.refundStatus = refundStatus;
    }

    // Date range filter
    if (dateRange) {
      const now = new Date();
      let startDate;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }
      
      if (startDate) {
        filterQuery.requestDate = { $gte: startDate };
      }
    }

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { returnId: { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get returns with pagination
    const skip = (page - 1) * limit;
    
    const returns = await Return.find(filterQuery)
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .populate({
        path: 'productId',
        select: 'productName mainImage'
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalReturns = await Return.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalReturns / limit);


    //  Get statistics using enum constants
    const [pendingReturns, approvedReturns, totalRefundAmount] = await Promise.all([
      Return.countDocuments({ status: RETURN_STATUS.PENDING }),    // 
      Return.countDocuments({ status: RETURN_STATUS.APPROVED }),   // 
      Return.aggregate([
        { $match: { status: { $in: [RETURN_STATUS.APPROVED, RETURN_STATUS.COMPLETED] } } },  // 
        { $group: { _id: null, total: { $sum: '$refundAmount' } } }
      ])
    ]);

    //  Pass all enum constants to template
    res.render('admin/returns', {
      title: 'Return Management',
      returns,
      currentPage: page,
      totalPages,
      totalReturns,
      pendingReturns,
      approvedReturns,
      totalRefundAmount: totalRefundAmount[0]?.total || 0,
      //Complete enum constants for template dropdowns
      orderStatuses: getOrderStatusArray(),
      returnStatuses: Object.values(RETURN_STATUS),         
      paymentStatuses: getPaymentStatusArray(),             
      returnReasons: getReturnReasonsArray(),               
      ORDER_STATUS: ORDER_STATUS,                           
      RETURN_STATUS: RETURN_STATUS,                         
      PAYMENT_STATUS: PAYMENT_STATUS,                       
      filters: {
        status,
        refundStatus,
        search,
        dateRange,
        sortBy,
        sortOrder
      },
      refundStatuses: Object.values(REFUND_STATUS),
      layout: 'admin/layout'
    });

  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).render('admin/returns', {
      title: 'Return Management',
      returns: [],
      currentPage: 1,
      totalPages: 1,
      totalReturns: 0,
      pendingReturns: 0,
      approvedReturns: 0,
      totalRefundAmount: 0,
      orderStatuses: getOrderStatusArray(),
      returnStatuses: Object.values(RETURN_STATUS),
      paymentStatuses: getPaymentStatusArray(),
      returnReasons: getReturnReasonsArray(),
      ORDER_STATUS: ORDER_STATUS,
      RETURN_STATUS: RETURN_STATUS,
      PAYMENT_STATUS: PAYMENT_STATUS,
      filters: {},
      error: 'Error loading returns',
      layout: 'admin/layout'
    });
  }
};

exports.getReturnsAPI = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Get filter parameters (keep your existing filter logic)
    const status = req.query.status || '';
    const refundStatus = req.query.refundStatus || '';
    const search = req.query.search || '';
    const dateRange = req.query.dateRange || '';
    const sortBy = req.query.sortBy || 'requestDate';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build filter query (keep your existing logic)
    let filterQuery = {};
    
    if (status) {
      filterQuery.status = status;
    }
    
    if (refundStatus) {
      filterQuery.refundStatus = refundStatus;
    }

    // Search functionality
    if (search) {
      filterQuery.$or = [
        { returnId: { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filter (keep your existing logic)
    if (dateRange) {
      const now = new Date();
      let startDate;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }
      
      if (startDate) {
        filterQuery.requestDate = { $gte: startDate };
      }
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get returns with pagination
    const skip = (page - 1) * limit;
    
    const returns = await Return.find(filterQuery)
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .populate({
        path: 'productId',
        select: 'productName mainImage'
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalReturns = await Return.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalReturns / limit);


    // Get statistics
    const [pendingReturns, approvedReturns, totalRefundAmount] = await Promise.all([
      Return.countDocuments({ status: RETURN_STATUS.PENDING }),
      Return.countDocuments({ status: RETURN_STATUS.APPROVED }),
      Return.aggregate([
        { $match: { status: { $in: [RETURN_STATUS.APPROVED, RETURN_STATUS.COMPLETED] } } },
        { $group: { _id: null, total: { $sum: '$refundAmount' } } }
      ])
    ]);

    // ✅ FIXED: Match the orders API response structure
    res.json({
      success: true,
      data: {
        returns,
        currentPage: page,
        totalPages,
        totalReturns,
        pendingReturns,
        approvedReturns,
        totalRefundAmount: totalRefundAmount[0]?.total || 0,
        filters: {
          status,
          refundStatus,
          search,
          dateRange,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error fetching returns API:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching returns'
    });
  }
};




// Get single return details
// exports.getReturnDetails = async (req, res) => {
//   try {
//     const { returnId } = req.params;

//     const returnRequest = await Return.findById(returnId)
//       .populate({
//         path: 'userId',
//         select: 'name email phone profilePhoto'
//       })
//       .populate({
//         path: 'productId',
//         select: 'productName mainImage subImages regularPrice salePrice category brand'
//       })
//       .populate({
//         path: 'processedBy',
//         select: 'name email'
//       })
//       .lean();

//     if (!returnRequest) {
//       return res.status(404).render('error/404', {
//         title: 'Return Request Not Found',
//         message: 'The requested return could not be found.',
//         error: {
//           status: 404,
//           stack: ''
//         },
//         layout: 'admin/layout'
//       });
//     }

//     // Get the original order for additional context
//     const order = await Order.findOne({ orderId: returnRequest.orderId })
//       .populate({
//         path: 'deliveryAddress.addressId',
//         select: 'address'
//       })
//       .lean();

//     // Extract specific delivery address if available
//     if (order && order.deliveryAddress && order.deliveryAddress.addressId && order.deliveryAddress.addressId.address) {
//       const addressIndex = order.deliveryAddress.addressIndex;
//       const specificAddress = order.deliveryAddress.addressId.address[addressIndex];
      
//       if (specificAddress) {
//         order.deliveryAddress = {
//           ...order.deliveryAddress,
//           ...specificAddress
//         };
//       }
//     }

//     // ✅ RENDER: EJS template instead of JSON response
//     res.render('admin/return-details', {
//       title: `Return Details - ${returnRequest._id}`,
//       returnRequest,
//       order,
//       // Helper functions for status colors
//       getReturnStatusColor: (status) => {
//         const colorMap = {
//           'pending': 'warning',
//           'approved': 'success', 
//           'rejected': 'danger',
//           'completed': 'info',
//           'cancelled': 'secondary'
//         };
//         return colorMap[status] || 'secondary';
//       },
//       layout: 'admin/layout'
//     });


//   } catch (error) {
//     console.error('Error fetching return details:', error);
//     res.status(500).render('admin/error', {
//       title: 'Server Error',
//       message: 'An error occurred while loading the return details.',
//       error: {
//         status: 500,
//         stack: process.env.NODE_ENV === 'development' ? error.stack : ''
//       },
//       layout: 'admin/layout'
//     });
//   }
// };

// Approve return request
exports.approveReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { refundAmount, notes } = req.body;

    // Use OrderService to approve return - handles everything automatically
    const result = await orderService.approveItemReturn(
      returnId,
      req.user?._id || 'admin',
      refundAmount // Optional custom refund amount
    );

    res.json({
      success: true,
      message: result.message,
      return: {
        returnId: result.returnRequest.returnId,
        status: result.returnRequest.status,
        refundAmount: result.refundAmount
      }
    });

  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error approving return request'
    });
  }
};


// Approving bulk order returns
exports.approveOrderReturn = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Use OrderService to approve all returns for the order
    const result = await orderService.approveOrderReturn(
      orderId,
      req.user?._id || 'admin'
    );

    res.json({
      success: true,
      message: result.message,
      order: {
        orderId: result.order.orderId,
        status: result.order.status,
        itemsAffected: result.itemsAffected,
        totalRefundAmount: result.totalRefundAmount
      }
    });

  } catch (error) {
    console.error('Error approving order return:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error approving order return'
    });
  }
};

// Reject return request
exports.rejectReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { rejectionReason } = req.body;

    //Simple validation for rejection reason (admin-provided text)
    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rejection reason'
      });
    }

    
    // Rejection reasons are admin-provided free text, not from RETURN_REASONS enum
    // const validReasons = getReturnReasonsArray();
    // if (!validReasons.includes(rejectionReason)) { ... }

    // Use OrderService to reject return
    const result = await orderService.rejectItemReturn(
      returnId,
      req.user?._id || 'admin',
      rejectionReason
    );

    res.json({
      success: true,
      message: result.message,
      return: {
        returnId: result.returnRequest.returnId,
        status: result.returnRequest.status,        
        rejectionReason: result.returnRequest.rejectionReason
      }
    });

  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error rejecting return request'
    });
  }
};



//Reject all return requests for an order
exports.rejectOrderReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rejectionReason } = req.body;

    // Simple validation for rejection reason (admin-provided text)
    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rejection reason'
      });
    }


    // Use OrderService to reject all returns for the order
    const result = await orderService.rejectOrderReturn(
      orderId,
      req.user?._id || 'admin',
      rejectionReason
    );

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
    console.error('Error rejecting order return:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error rejecting order return'
    });
  }
};


// Get return statistics for dashboard
exports.getReturnStatistics = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const stats = await Promise.all([
      // Today's returns
      Return.countDocuments({
        requestDate: { $gte: startOfDay }
      }),
      
      // This week's returns
      Return.countDocuments({
        requestDate: { $gte: startOfWeek }
      }),
      
      // This month's returns
      Return.countDocuments({
        requestDate: { $gte: startOfMonth }
      }),
      
      // Total returns
      Return.countDocuments(),
      
      // Status distribution
      Return.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      //Refund statistics using enum constants
      Return.aggregate([
        {
          $match: { status: { $in: [RETURN_STATUS.APPROVED, RETURN_STATUS.COMPLETED] } }
        },
        {
          $group: {
            _id: null,
            totalRefundAmount: { $sum: '$refundAmount' },
            averageRefundAmount: { $avg: '$refundAmount' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      statistics: {
        todayReturns: stats[0],
        weekReturns: stats[1],
        monthReturns: stats[2],
        totalReturns: stats[3],
        statusDistribution: stats[4],
        refundStats: stats[5][0] || { totalRefundAmount: 0, averageRefundAmount: 0 }
      }
    });

  } catch (error) {
    console.error('Error fetching return statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching return statistics'
    });
  }
};


// Export returns data (CSV)
exports.exportReturns = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    let filterQuery = {};
    
    if (startDate && endDate) {
      filterQuery.requestDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      filterQuery.status = status;
    }

    const returns = await Return.find(filterQuery)
      .populate('userId', 'name email')
      .populate('productId', 'productName')
      .sort({ requestDate: -1 })
      .lean();

    // Generate CSV content
    const csvHeaders = [
      'Return ID',
      'Order ID',
      'Customer Name',
      'Customer Email',
      'Product Name',
      'Size',
      'Quantity',
      'Return Amount',
      'Refund Amount',
      'Request Date',
      'Status',
      'Refund Status',
      'Reason'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    returns.forEach(returnItem => {
      const row = [
        returnItem.returnId,
        returnItem.orderId,
        returnItem.userId?.name || 'N/A',
        returnItem.userId?.email || 'N/A',
        returnItem.productName,
        returnItem.size,
        returnItem.quantity,
        returnItem.totalPrice,
        returnItem.refundAmount || 0,
        new Date(returnItem.requestDate).toLocaleDateString(),
        returnItem.status,
        returnItem.refundStatus,
        `"${returnItem.reason.replace(/"/g, '""')}"` // Escape quotes in reason
      ];
      csvContent += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=returns-export.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting returns:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting returns'
    });
  }
};