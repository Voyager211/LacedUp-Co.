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

    // Create PDF with landscape orientation for better table fit
    const doc = new PDFDocument({ 
      margin: 40, 
      size: 'A4',
      layout: 'landscape' // Changed to landscape for better table width
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.pdf`);
    
    doc.pipe(res);

    // Helper function to draw table
    function drawTable(doc, startY) {
      const tableTop = startY;
      const tableLeft = 40;
      const rowHeight = 30;
      const headerHeight = 35;
      
      // Column definitions - adjusted widths for landscape
      const columns = [
        { header: 'Order ID', width: 150, x: 0 },
        { header: 'Customer', width: 130, x: 150 },
        { header: 'Amount', width: 100, x: 280 },
        { header: 'Status', width: 100, x: 380 }
      ];

      // Calculate positions
      columns.forEach((col, index) => {
        if (index > 0) {
          col.x = columns[index - 1].x + columns[index - 1].width;
        }
      });

      const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

      // Draw header background
      doc.save();
      doc.rect(tableLeft, tableTop, tableWidth, headerHeight)
         .fillAndStroke('#e8e8e8', '#000000');
      doc.restore();

      // Draw header text
      doc.fillColor('#000000')
         .fontSize(11)
         .font('Helvetica-Bold');
      
      columns.forEach(col => {
        doc.text(
          col.header, 
          tableLeft + col.x + 8, 
          tableTop + 12,
          { width: col.width - 16, align: 'left' }
        );
      });

      // Draw data rows
      let currentY = tableTop + headerHeight;
      doc.font('Helvetica').fontSize(10);

      orders.forEach((order, index) => {
        // Check for page break
        if (currentY + rowHeight > doc.page.height - 60) {
          doc.addPage({ layout: 'landscape' });
          currentY = 60;
          
          // Redraw header
          doc.save();
          doc.rect(tableLeft, currentY, tableWidth, headerHeight)
             .fillAndStroke('#e8e8e8', '#000000');
          doc.restore();
          
          doc.fillColor('#000000')
             .fontSize(11)
             .font('Helvetica-Bold');
          
          columns.forEach(col => {
            doc.text(
              col.header, 
              tableLeft + col.x + 8, 
              currentY + 12,
              { width: col.width - 16, align: 'left' }
            );
          });
          
          currentY += headerHeight;
          doc.font('Helvetica').fontSize(10);
        }

        // Alternate row colors
        doc.save();
        if (index % 2 === 1) {
          doc.rect(tableLeft, currentY, tableWidth, rowHeight)
             .fill('#f9f9f9');
        }
        doc.restore();

        // Draw borders
        doc.strokeColor('#dddddd')
           .lineWidth(0.5)
           .rect(tableLeft, currentY, tableWidth, rowHeight)
           .stroke();

        // Draw cell data
        doc.fillColor('#000000');
        
        const rowData = [
          { text: order.orderId, col: columns[0] },
          { text: order.user?.name || 'New User', col: columns[1] },
          { text: `₹${order.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, col: columns[2] },
          { text: order.status.charAt(0).toUpperCase() + order.status.slice(1), col: columns[3] }
        ];

        rowData.forEach(item => {
          doc.text(
            item.text,
            tableLeft + item.col.x + 8,
            currentY + 10,
            {
              width: item.col.width - 16,
              height: rowHeight - 10,
              align: 'left',
              ellipsis: true
            }
          );
        });

        // Draw vertical lines between columns
        columns.forEach((col, index) => {
          if (index < columns.length - 1) {
            doc.strokeColor('#dddddd')
               .moveTo(tableLeft + col.x + col.width, currentY)
               .lineTo(tableLeft + col.x + col.width, currentY + rowHeight)
               .stroke();
          }
        });

        currentY += rowHeight;
      });

      // Draw outer border
      doc.strokeColor('#000000')
         .lineWidth(1.5)
         .rect(tableLeft, tableTop, tableWidth, currentY - tableTop)
         .stroke();
    }

    // Header
    doc.fontSize(22)
       .font('Helvetica-Bold')
       .text('LacedUp Co. - Sales Report', { align: 'center' });
    
    doc.moveDown(0.5);
    
    doc.fontSize(12)
       .font('Helvetica')
       .text(
         `Period: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`, 
         { align: 'center' }
       );
    
    doc.moveDown(1.5);

    // Summary Statistics
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Summary Statistics', { underline: true });
    
    doc.moveDown(0.5);

    const statsY = doc.y;
    const statsBoxWidth = 720;
    const statsBoxHeight = 80;
    
    // Stats box with border
    doc.save();
    doc.roundedRect(50, statsY, statsBoxWidth, statsBoxHeight, 5)
       .fillAndStroke('#f0f8ff', '#4a90e2');
    doc.restore();
    
    doc.fillColor('#000000')
       .fontSize(11)
       .font('Helvetica');
    
    // Two columns of stats
    const leftCol = 70;
    const rightCol = 400;
    const statsTextY = statsY + 20;
    
    doc.text(`Total Revenue: ₹${stats.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, leftCol, statsTextY);
    doc.text(`Total Orders: ${stats.totalOrders}`, leftCol, statsTextY + 20);
    doc.text(`Total Discounts: ₹${stats.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightCol, statsTextY);
    doc.text(`Net Revenue: ₹${stats.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rightCol, statsTextY + 20);
    
    doc.moveDown(4);

    // Order Details section
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Order Details', { underline: true });
    
    doc.moveDown(1);

    // Draw the table
    drawTable(doc, doc.y);

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

    const workbook = new ExcelJS.Workbook();
    
    // ==================== WORKSHEET 1: SUMMARY ====================
    const summarySheet = workbook.addWorksheet('Summary Statistics');
    
    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = 'LacedUp Co. - Sales Report';
    summarySheet.getCell('A1').font = { size: 16, bold: true };
    summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Period
    summarySheet.mergeCells('A2:D2');
    summarySheet.getCell('A2').value = `Period: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`;
    summarySheet.getCell('A2').alignment = { horizontal: 'center' };
    summarySheet.getCell('A2').font = { size: 12 };
    
    // Empty row
    summarySheet.getRow(3).height = 10;
    
    // Summary Statistics Header
    summarySheet.mergeCells('A4:D4');
    summarySheet.getCell('A4').value = 'Summary Statistics';
    summarySheet.getCell('A4').font = { size: 14, bold: true };
    summarySheet.getCell('A4').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }
    };
    
    // Summary data
    const summaryData = [
      ['Total Revenue', `₹${stats.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Total Orders', stats.totalOrders],
      ['Average Order Value', `₹${stats.averageOrder.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Total Discounts', `₹${stats.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Net Revenue', `₹${stats.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
    ];
    
    summaryData.forEach((row, index) => {
      const rowNumber = index + 5;
      summarySheet.getCell(`A${rowNumber}`).value = row[0];
      summarySheet.getCell(`A${rowNumber}`).font = { bold: true };
      summarySheet.getCell(`B${rowNumber}`).value = row[1];
      
      // Add borders
      ['A', 'B'].forEach(col => {
        summarySheet.getCell(`${col}${rowNumber}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Column widths
    summarySheet.getColumn('A').width = 25;
    summarySheet.getColumn('B').width = 25;
    
    // ==================== WORKSHEET 2: DAILY ANALYSIS ====================
    const analysisSheet = workbook.addWorksheet('Sales Analysis');
    
    // Title
    analysisSheet.mergeCells('A1:E1');
    analysisSheet.getCell('A1').value = 'Daily Sales Analysis';
    analysisSheet.getCell('A1').font = { size: 14, bold: true };
    analysisSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    analysisSheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }
    };
    
    // Headers
    const analysisHeaders = ['Date/Period', 'Orders', 'Revenue', 'Discount', 'Net Revenue'];
    analysisSheet.addRow(analysisHeaders);
    
    const headerRow = analysisSheet.getRow(2);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 20;
    
    // Add daily analysis data
    dailyAnalysis.forEach(day => {
      analysisSheet.addRow([
        new Date(day.date).toLocaleDateString('en-IN', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        }),
        day.orders,
        `₹${day.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `-₹${day.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `₹${day.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);
    });
    
    // Add total row
    const totalRow = analysisSheet.addRow([
      'TOTAL',
      stats.totalOrders,
      `₹${stats.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `-₹${stats.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `₹${stats.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    ]);
    
    totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' }
    };
    
    // Style all data cells with borders
    analysisSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        
        // Alternate row colors (except header and total)
        if (rowNumber > 2 && rowNumber < analysisSheet.rowCount) {
          if ((rowNumber - 2) % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            });
          }
        }
      }
    });
    
    // Column widths
    analysisSheet.getColumn(1).width = 18;
    analysisSheet.getColumn(2).width = 12;
    analysisSheet.getColumn(3).width = 18;
    analysisSheet.getColumn(4).width = 18;
    analysisSheet.getColumn(5).width = 18;
    
    // Center align numbers
    analysisSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 2) {
        for (let i = 2; i <= 5; i++) {
          row.getCell(i).alignment = { horizontal: 'right', vertical: 'middle' };
        }
      }
    });
    
    // ==================== WORKSHEET 3: ORDER DETAILS ====================
    const ordersSheet = workbook.addWorksheet('Order Details');
    
    // Define columns
    ordersSheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 22 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Payment Method', key: 'paymentMethod', width: 17 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Discount', key: 'discount', width: 15 },
      { header: 'Final Amount', key: 'finalAmount', width: 15 }
    ];
    
    // Style header row
    const orderHeaderRow = ordersSheet.getRow(1);
    orderHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    orderHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    orderHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
    orderHeaderRow.height = 20;
    
    // Add data rows
    orders.forEach(order => {
      ordersSheet.addRow({
        orderId: order.orderId,
        date: new Date(order.createdAt).toLocaleDateString('en-IN'),
        customer: order.user?.name || 'Guest',
        paymentMethod: order.paymentMethod.toUpperCase(),
        status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
        amount: order.subtotal || order.totalAmount,
        discount: (order.totalDiscount || 0) + (order.couponDiscount || 0),
        finalAmount: order.totalAmount
      });
    });
    
    // Format currency columns
    ordersSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        // Amount column
        row.getCell(6).numFmt = '₹#,##0.00';
        // Discount column
        row.getCell(7).numFmt = '₹#,##0.00';
        // Final Amount column
        row.getCell(8).numFmt = '₹#,##0.00';
        
        // Add borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        
        // Alternate row colors
        if ((rowNumber - 1) % 2 === 0) {
          row.eachCell((cell) => {
            if (!cell.fill || !cell.fill.fgColor) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          });
        }
      }
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
