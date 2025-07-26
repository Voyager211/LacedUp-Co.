const Return = require('../../models/Return');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Wallet = require('../../models/Wallet');

// Get all return requests for admin
exports.getAllReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
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

    // Get statistics
    const [pendingReturns, approvedReturns, totalRefundAmount] = await Promise.all([
      Return.countDocuments({ status: 'Pending' }),
      Return.countDocuments({ status: 'Approved' }),
      Return.aggregate([
        { $match: { status: { $in: ['Approved', 'Completed'] } } },
        { $group: { _id: null, total: { $sum: '$refundAmount' } } }
      ])
    ]);

    res.render('admin/returns', {
      title: 'Return Management',
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
      },
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
      filters: {},
      error: 'Error loading returns',
      layout: 'admin/layout'
    });
  }
};

// Get single return details
exports.getReturnDetails = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate({
        path: 'userId',
        select: 'name email phone profilePhoto'
      })
      .populate({
        path: 'productId',
        select: 'productName mainImage subImages regularPrice salePrice category brand'
      })
      .populate({
        path: 'processedBy',
        select: 'name email'
      })
      .lean();

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Get the original order for additional context
    const order = await Order.findOne({ orderId: returnRequest.orderId })
      .populate({
        path: 'deliveryAddress.addressId',
        select: 'address'
      })
      .lean();

    res.json({
      success: true,
      return: returnRequest,
      order: order
    });

  } catch (error) {
    console.error('Error fetching return details:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading return details'
    });
  }
};

// Approve return request
exports.approveReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { refundAmount, notes } = req.body;

    const returnRequest = await Return.findById(returnId);
    
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    if (returnRequest.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending return requests can be approved'
      });
    }

    // Get the order and item details
    const order = await Order.findOne({ orderId: returnRequest.orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Associated order not found'
      });
    }

    const item = order.items.id(returnRequest.itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Associated item not found'
      });
    }

    // Update product stock
    const product = await Product.findById(returnRequest.productId);
    if (product) {
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (variant) {
        variant.stock += returnRequest.quantity;
        await product.save();
        console.log(`Stock updated: Added ${returnRequest.quantity} units to ${product.productName} (${returnRequest.size})`);
      }
    }

    // Credit amount to user's wallet using separate Wallet model
    const user = await User.findById(returnRequest.userId);
    if (user) {
      const creditAmount = refundAmount || returnRequest.totalPrice;
      
      // Get or create wallet for the user
      const wallet = await Wallet.getOrCreateWallet(returnRequest.userId);
      
      // Add credit to wallet
      await wallet.addCredit(
        creditAmount,
        `Refund for returned item: ${returnRequest.productName} (${returnRequest.size})`,
        returnRequest.orderId,
        returnRequest.returnId
      );
      
      console.log(`Wallet credited: ₹${creditAmount} added to user ${user.name}'s wallet. New balance: ₹${wallet.balance}`);
    }

    // Approve the return
    await returnRequest.approve(notes, refundAmount, req.user?._id);

    // Update the order item status to 'Returned'
    if (order) {
      const item = order.items.id(returnRequest.itemId);
      if (item && item.status !== 'Returned') {
        await order.updateItemStatus(returnRequest.itemId, 'Returned', 'Item return approved by admin');
      }
    }

    res.json({
      success: true,
      message: 'Return request approved successfully. Stock updated and amount credited to user wallet.',
      return: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        refundAmount: returnRequest.refundAmount
      }
    });

  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving return request'
    });
  }
};

// Reject return request
exports.rejectReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { reason } = req.body;

    const returnRequest = await Return.findById(returnId);
    
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    if (returnRequest.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending return requests can be rejected'
      });
    }

    // Reject the return
    await returnRequest.reject(reason, req.user?._id);

    res.json({
      success: true,
      message: 'Return request rejected successfully',
      return: {
        returnId: returnRequest.returnId,
        status: returnRequest.status
      }
    });

  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting return request'
    });
  }
};

// Process refund
exports.processRefund = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { refundMethod, notes } = req.body;

    const returnRequest = await Return.findById(returnId);
    
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    if (returnRequest.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved return requests can be processed for refund'
      });
    }

    if (returnRequest.refundStatus === 'Processed') {
      return res.status(400).json({
        success: false,
        message: 'Refund has already been processed'
      });
    }

    // Process the refund
    await returnRequest.processRefund(refundMethod, req.user?._id);

    // Update return status to completed
    await returnRequest.updateStatus('Completed', notes || 'Refund processed successfully', req.user?._id);

    res.json({
      success: true,
      message: 'Refund processed successfully',
      return: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        refundStatus: returnRequest.refundStatus
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing refund'
    });
  }
};

// Update return status
exports.updateReturnStatus = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { status, notes } = req.body;

    const returnRequest = await Return.findById(returnId);
    
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Processing', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Update the return status
    await returnRequest.updateStatus(status, notes, req.user?._id);

    res.json({
      success: true,
      message: `Return status updated to ${status}`,
      return: {
        returnId: returnRequest.returnId,
        status: returnRequest.status
      }
    });

  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating return status'
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
      
      // Refund statistics
      Return.aggregate([
        {
          $match: { status: { $in: ['Approved', 'Completed'] } }
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