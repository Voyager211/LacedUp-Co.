const Order = require('../../models/Order');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Helper function to get date range based on time period
function getDateRange(timePeriod, startDate, endDate) {
  const now = new Date();
  let start, end;

  switch (timePeriod) {
    case 'weekly':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    case 'monthly':
      start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    case 'yearly':
      start = new Date(now);
      start.setDate(now.getDate() - 365);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    case 'custom':
      if (startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      } else {
        start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
      }
      break;

    default:
      start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

// Get sales report page
const getSalesReport = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Get filter parameters
    const timePeriod = req.query.timePeriod || 'monthly';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Get date range
    const { start, end } = getDateRange(timePeriod, startDate, endDate);

    // Build match query
    const matchQuery = {
      createdAt: { $gte: start, $lte: end }
    };

    // Add payment method filter
    if (paymentMethod !== 'all') {
      matchQuery.paymentMethod = paymentMethod;
    }

    // Add order status filter
    if (orderStatus !== 'all') {
      matchQuery.status = orderStatus;
    }

    // Get orders for the period
    const orders = await Order.find(matchQuery)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalOrders / limit);

    // Calculate sales statistics
    const salesStats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          totalDiscount: { 
            $sum: { $add: ['$totalDiscount', '$couponDiscount'] }
          }
        }
      }
    ]);

    const stats = salesStats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalDiscount: 0
    };

    stats.averageOrder = stats.totalOrders > 0 
      ? stats.totalRevenue / stats.totalOrders 
      : 0;
    
    stats.netRevenue = stats.totalRevenue - stats.totalDiscount;

    // Get daily analysis
    const dailyAnalysis = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          discount: { 
            $sum: { $add: ['$totalDiscount', '$couponDiscount'] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          orders: 1,
          revenue: 1,
          discount: 1,
          netRevenue: { $subtract: ['$revenue', '$discount'] }
        }
      },
      { $sort: { date: -1 } }
    ]);

    // Format orders for display
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      date: new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }),
      customer: order.user ? order.user.name : 'Guest',
      paymentMethod: order.paymentMethod,
      status: order.status,
      amount: order.subtotal || order.totalAmount,
      discount: (order.totalDiscount || 0) + (order.couponDiscount || 0),
      finalAmount: order.totalAmount
    }));

    res.render('admin/sales-report', {
      title: 'Sales Report',
      salesStats: stats,
      dailyAnalysis,
      orders: formattedOrders,
      filters: {
        timePeriod,
        paymentMethod,
        orderStatus,
        startDate: startDate || '',
        endDate: endDate || ''
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalOrders,
        itemsPerPage: limit,  // ADDED THIS
        hasPrev: page > 1,
        hasNext: page < totalPages
      },
      layout: 'admin/layout'
    });

  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.render('admin/sales-report', {
      title: 'Sales Report',
      error: 'Error loading sales report',
      salesStats: {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrder: 0,
        totalDiscount: 0,
        netRevenue: 0
      },
      dailyAnalysis: [],
      orders: [],
      filters: {
        timePeriod: 'monthly',
        paymentMethod: 'all',
        orderStatus: 'all',
        startDate: '',
        endDate: ''
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalOrders: 0,
        itemsPerPage: 10,  // ADDED THIS
        hasPrev: false,
        hasNext: false
      },
      layout: 'admin/layout'
    });
  }
};

// Export sales report as PDF
const exportPDF = async (req, res) => {
  try {
    const timePeriod = req.query.timePeriod || 'monthly';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const { start, end } = getDateRange(timePeriod, startDate, endDate);

    const matchQuery = {
      createdAt: { $gte: start, $lte: end }
    };

    if (paymentMethod !== 'all') matchQuery.paymentMethod = paymentMethod;
    if (orderStatus !== 'all') matchQuery.status = orderStatus;

    const orders = await Order.find(matchQuery)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const salesStats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          totalDiscount: { $sum: { $add: ['$totalDiscount', '$couponDiscount'] } }
        }
      }
    ]);

    const stats = salesStats[0] || { totalRevenue: 0, totalOrders: 0, totalDiscount: 0 };
    stats.netRevenue = stats.totalRevenue - stats.totalDiscount;

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.pdf`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('LacedUp Co. - Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // Statistics
    doc.fontSize(14).text('Summary Statistics', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Revenue: ₹${stats.totalRevenue.toFixed(2)}`);
    doc.text(`Total Orders: ${stats.totalOrders}`);
    doc.text(`Total Discounts: ₹${stats.totalDiscount.toFixed(2)}`);
    doc.text(`Net Revenue: ₹${stats.netRevenue.toFixed(2)}`);
    doc.moveDown(2);

    // Orders table
    doc.fontSize(14).text('Order Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);

    orders.forEach((order, index) => {
      if (index > 0 && index % 10 === 0) {
        doc.addPage();
      }
      
      doc.text(`${order.orderId} | ${order.user?.name || 'Guest'} | ₹${order.totalAmount.toFixed(2)} | ${order.status}`);
    });

    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ success: false, message: 'Error generating PDF' });
  }
};

// Export sales report as Excel
const exportExcel = async (req, res) => {
  try {
    const timePeriod = req.query.timePeriod || 'monthly';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const { start, end } = getDateRange(timePeriod, startDate, endDate);

    const matchQuery = {
      createdAt: { $gte: start, $lte: end }
    };

    if (paymentMethod !== 'all') matchQuery.paymentMethod = paymentMethod;
    if (orderStatus !== 'all') matchQuery.status = orderStatus;

    const orders = await Order.find(matchQuery)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Define columns
    worksheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Discount', key: 'discount', width: 12 },
      { header: 'Final Amount', key: 'finalAmount', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    orders.forEach(order => {
      worksheet.addRow({
        orderId: order.orderId,
        date: new Date(order.createdAt).toLocaleDateString('en-IN'),
        customer: order.user?.name || 'Guest',
        paymentMethod: order.paymentMethod,
        status: order.status,
        amount: order.subtotal || order.totalAmount,
        discount: (order.totalDiscount || 0) + (order.couponDiscount || 0),
        finalAmount: order.totalAmount
      });
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).json({ success: false, message: 'Error generating Excel file' });
  }
};

module.exports = {
  getSalesReport,
  exportPDF,
  exportExcel
};
