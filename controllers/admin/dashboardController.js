const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, 
        startOfMonth, endOfMonth, startOfYear, endOfYear, 
        subMonths, subWeeks, subYears } = require('date-fns');
const PDFDocument = require('pdfkit');

// ============================================
// HELPER: GET DATE RANGE BASED ON PERIOD
// ============================================
const getDateRange = (period = 'monthly') => {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case 'weekly':
            startDate = subWeeks(now, 12);
            endDate = now; 
            break;
        case 'yearly':
            startDate = subYears(now, 5);
            endDate = now;
            break;
        case 'monthly':
        default:
            startDate = subMonths(now, 12);
            endDate = now;
    }

    console.log(`📅 Date range for ${period}:`, { startDate, endDate });
    return { startDate, endDate };
};

// ============================================
// RENDER DASHBOARD PAGE
// ============================================
const renderDashboard = async (req, res) => {
    try {
        res.render('admin/dashboard', {
            title: 'Admin Dashboard - LacedUp Co',
            layout: 'admin/layout'
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
};

// ============================================
// GET DASHBOARD STATISTICS (FILTERED BY PERIOD)
// ============================================
const getDashboardStats = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        console.log('📊 getDashboardStats called with period:', period);
        
        const { startDate, endDate } = getDateRange(period);

        const [totalCustomers, totalOrders, revenueData, pendingOrders] = await Promise.all([
            // Total customers (only users, not admins, not blocked)
            User.countDocuments({ role: 'user', isBlocked: false }),
            
            // Total orders count (within period)
            Order.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            }),
            
            // Total revenue from completed orders (within period)
            Order.aggregate([
                { 
                    $match: { 
                        createdAt: { $gte: startDate, $lte: endDate },
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    } 
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    }
                },
                { 
                    $group: { 
                        _id: null, 
                        totalRevenue: { $sum: '$items.totalPrice' }
                    } 
                }
            ]),
            
            // Pending orders (within period)
            Order.countDocuments({ 
                createdAt: { $gte: startDate, $lte: endDate },
                'items.status': { $in: ['Pending', 'Processing'] } 
            })
        ]);

        const responseData = {
            totalCustomers,
            totalOrders,
            totalRevenue: revenueData[0]?.totalRevenue || 0,
            pendingOrders
        };

        console.log('✅ Stats response:', responseData);

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics'
        });
    }
};

// ============================================
// GET SALES DATA (MONTHLY/WEEKLY/YEARLY)
// ============================================
const getSalesData = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        console.log('📊 getSalesData called with period:', period);
        
        let salesData, labels;

        switch (period) {
            case 'weekly':
                ({ salesData, labels } = await getWeeklySales());
                break;
            case 'yearly':
                ({ salesData, labels } = await getYearlySales());
                break;
            case 'monthly':
            default:
                ({ salesData, labels } = await getMonthlySales());
        }

        console.log('✅ Sales data points:', salesData.length);

        res.json({
            success: true,
            data: { labels, salesData }
        });
    } catch (error) {
        console.error('❌ Error fetching sales data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sales data'
        });
    }
};

// ============================================
// HELPER: GET MONTHLY SALES (LAST 12 MONTHS)
// ============================================
const getMonthlySales = async () => {
    const months = [];
    const labels = [];
    const now = new Date();

    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
        const date = subMonths(now, i);
        months.push({
            start: startOfMonth(date),
            end: endOfMonth(date),
            label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        });
        labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
    }

    const salesData = await Promise.all(
        months.map(async ({ start, end }) => {
            const result = await Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$items.totalPrice' }
                    }
                }
            ]);
            return result[0]?.total || 0;
        })
    );

    return { salesData, labels };
};

// ============================================
// HELPER: GET WEEKLY SALES (LAST 12 WEEKS)
// ============================================
const getWeeklySales = async () => {
    const weeks = [];
    const labels = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
        const date = subWeeks(now, i);
        weeks.push({
            start: startOfWeek(date, { weekStartsOn: 1 }),
            end: endOfWeek(date, { weekStartsOn: 1 }),
            label: `Week ${12 - i}`
        });
        labels.push(`Week ${12 - i}`);
    }

    const salesData = await Promise.all(
        weeks.map(async ({ start, end }) => {
            const result = await Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$items.totalPrice' }
                    }
                }
            ]);
            return result[0]?.total || 0;
        })
    );

    return { salesData, labels };
};

// ============================================
// HELPER: GET YEARLY SALES (LAST 5 YEARS)
// ============================================
const getYearlySales = async () => {
    const years = [];
    const labels = [];
    const now = new Date();

    for (let i = 4; i >= 0; i--) {
        const date = subYears(now, i);
        years.push({
            start: startOfYear(date),
            end: endOfYear(date),
            label: date.getFullYear().toString()
        });
        labels.push(date.getFullYear().toString());
    }

    const salesData = await Promise.all(
        years.map(async ({ start, end }) => {
            const result = await Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$items.totalPrice' }
                    }
                }
            ]);
            return result[0]?.total || 0;
        })
    );

    return { salesData, labels };
};

// ============================================
// GET REVENUE DISTRIBUTION BY PAYMENT METHOD (FILTERED)
// ============================================
const getRevenueDistribution = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        console.log('📊 getRevenueDistribution called with period:', period);
        
        const { startDate, endDate } = getDateRange(period);

        const distribution = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $group: {
                    _id: '$paymentMethod',
                    totalRevenue: { $sum: '$items.totalPrice' }
                }
            },
            {
                $sort: { totalRevenue: -1 }
            }
        ]);

        console.log('📦 Revenue distribution results:', distribution);

        const totalRevenue = distribution.reduce((sum, item) => sum + item.totalRevenue, 0);

        const formattedData = distribution.map(item => ({
            paymentMethod: item._id || 'Unknown',
            revenue: item.totalRevenue,
            percentage: totalRevenue > 0 ? ((item.totalRevenue / totalRevenue) * 100).toFixed(2) : '0.00'
        }));

        console.log('✅ Formatted revenue data:', formattedData);

        res.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('❌ Error fetching revenue distribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching revenue distribution'
        });
    }
};

// ============================================
// ✅ UPDATED: GET BEST SELLING PRODUCTS (WITH IMAGE)
// ============================================
const getBestSellingProducts = async (req, res) => {
    try {
        const { period = 'monthly', limit = 5 } = req.query;
        const limitNum = parseInt(limit) || 5;
        
        console.log(`📊 getBestSellingProducts called with period: ${period}, limit: ${limitNum}`);
        
        const { startDate, endDate } = getDateRange(period);

        const bestProducts = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $group: {
                    _id: '$items.productId',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: limitNum },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'productDetails.brand',
                    foreignField: '_id',
                    as: 'brandDetails'
                }
            },
            { $unwind: { path: '$brandDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    productName: '$productDetails.productName',
                    brand: { $ifNull: ['$brandDetails.name', 'Unknown'] },
                    mainImage: '$productDetails.mainImage',  // ✅ ADD THIS
                    subImages: '$productDetails.subImages',  // ✅ ADD THIS
                    totalQuantity: 1,
                    totalRevenue: 1
                }
            }
        ]);

        console.log(`✅ Top ${limitNum} products loaded:`, bestProducts.length);

        res.json({
            success: true,
            data: bestProducts
        });
    } catch (error) {
        console.error('❌ Error fetching best selling products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling products'
        });
    }
};


// ============================================
// ✅ UPDATED: GET BEST SELLING CATEGORIES (WITH IMAGE)
// ============================================
const getBestSellingCategories = async (req, res) => {
    try {
        const { period = 'monthly', limit = 10 } = req.query;
        const limitNum = parseInt(limit) || 10;
        
        console.log(`📊 getBestSellingCategories called with period: ${period}, limit: ${limitNum}`);
        
        const { startDate, endDate } = getDateRange(period);

        const bestCategories = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $group: {
                    _id: '$productDetails.category',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' },
                    totalOrders: { $sum: 1 },
                    productIds: { $addToSet: '$items.productId' }
                }
            },
            {
                $project: {
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalProducts: { $size: '$productIds' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: limitNum },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoryDetails'
                }
            },
            { $unwind: '$categoryDetails' },
            {
                $project: {
                    categoryName: '$categoryDetails.name',
                    categoryImage: '$categoryDetails.image',  // ✅ ADD THIS
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalProducts: 1
                }
            }
        ]);

        console.log(`✅ Top ${limitNum} categories loaded:`, bestCategories.length);

        res.json({
            success: true,
            data: bestCategories
        });
    } catch (error) {
        console.error('❌ Error fetching best selling categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling categories'
        });
    }
};


// ============================================
// ✅ UPDATED: GET BEST SELLING BRANDS (WITH IMAGE)
// ============================================
const getBestSellingBrands = async (req, res) => {
    try {
        const { period = 'monthly', limit = 10 } = req.query;
        const limitNum = parseInt(limit) || 10;
        
        console.log(`📊 getBestSellingBrands called with period: ${period}, limit: ${limitNum}`);
        
        const { startDate, endDate } = getDateRange(period);

        const bestBrands = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $group: {
                    _id: '$productDetails.brand',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' },
                    totalOrders: { $sum: 1 },
                    productIds: { $addToSet: '$items.productId' }
                }
            },
            {
                $project: {
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalProducts: { $size: '$productIds' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: limitNum },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brandDetails'
                }
            },
            { $unwind: '$brandDetails' },
            {
                $project: {
                    brandName: '$brandDetails.name',
                    brandImage: '$brandDetails.image',  // ✅ ADD THIS
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalProducts: 1
                }
            }
        ]);

        console.log(`✅ Top ${limitNum} brands loaded:`, bestBrands.length);

        res.json({
            success: true,
            data: bestBrands
        });
    } catch (error) {
        console.error('❌ Error fetching best selling brands:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling brands'
        });
    }
};



// ============================================
// GET BEST SELLING CATEGORY (FILTERED)
// ============================================
const getBestSellingCategory = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        console.log('📊 getBestSellingCategory called with period:', period);
        
        const { startDate, endDate } = getDateRange(period);

        const bestCategory = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $group: {
                    _id: '$productDetails.category',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' },
                    totalOrders: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 1 },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoryDetails'
                }
            },
            { $unwind: '$categoryDetails' },
            {
                $project: {
                    categoryName: '$categoryDetails.name',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalOrders: 1
                }
            }
        ]);

        console.log('✅ Best category:', bestCategory[0]?.categoryName || 'None');

        res.json({
            success: true,
            data: bestCategory[0] || null
        });
    } catch (error) {
        console.error('❌ Error fetching best selling category:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling category'
        });
    }
};

// ============================================
// GET BEST SELLING BRAND (FILTERED)
// ============================================
const getBestSellingBrand = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        console.log('📊 getBestSellingBrand called with period:', period);
        
        const { startDate, endDate } = getDateRange(period);

        const bestBrand = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            { $unwind: '$items' },
            {
                $match: {
                    'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $group: {
                    _id: '$productDetails.brand',
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.totalPrice' },
                    productIds: { $addToSet: '$items.productId' }
                }
            },
            {
                $project: {
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalProducts: { $size: '$productIds' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 1 },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brandDetails'
                }
            },
            { $unwind: '$brandDetails' },
            {
                $project: {
                    brandName: '$brandDetails.name',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalProducts: 1
                }
            }
        ]);

        console.log('✅ Best brand:', bestBrand[0]?.brandName || 'None');

        res.json({
            success: true,
            data: bestBrand[0] || null
        });
    } catch (error) {
        console.error('❌ Error fetching best selling brand:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling brand'
        });
    }
};

// ============================================
// EXPORT LEDGER REPORT AS PDF
// ============================================
const exportLedgerPDF = async (req, res) => {
    try {
        const { timePeriod = 'monthly', paymentMethod = 'all', orderStatus = 'all' } = req.query;

        // Create a new PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Generate filename with date
        const today = new Date();
        const dateString = today.toISOString().split('T')[0];
        const filename = `LacedUp-Ledger-Report-${dateString}.pdf`;

        // Set headers to force download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Pipe PDF stream to response
        doc.pipe(res);

        // Simple placeholder content (replace with real ledger data)
        doc.fontSize(20).text('LacedUp Co - Ledger Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Generated on: ${today.toLocaleString()}`);
        doc.text(`Time Period: ${timePeriod}`);
        doc.text(`Payment Method: ${paymentMethod}`);
        doc.text(`Order Status: ${orderStatus}`);
        doc.moveDown();
        doc.text('This is a placeholder PDF. Replace this section with actual ledger data.');

        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error('Error exporting ledger PDF:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error exporting ledger report',
            });
        }
    }
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
    renderDashboard,
    getDashboardStats,
    getSalesData,
    getRevenueDistribution,
    getBestSellingProducts,
    getBestSellingCategories,
    getBestSellingBrands,
    getBestSellingCategory,
    getBestSellingBrand,
    exportLedgerPDF
};

