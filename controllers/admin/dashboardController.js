const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, 
        startOfMonth, endOfMonth, startOfYear, endOfYear, 
        subMonths, subWeeks, subYears } = require('date-fns');

// ============================================
// GET DASHBOARD STATISTICS
// ============================================
const getDashboardStats = async (req, res) => {
    try {
        const [totalCustomers, totalOrders, revenueData, pendingOrders] = await Promise.all([
            // Total customers (only users, not admins, not blocked)
            User.countDocuments({ role: 'user', isBlocked: false }),
            
            // Total orders count
            Order.countDocuments(),
            
            // Total revenue from completed orders
            Order.aggregate([
                { 
                    $match: { 
                        'items.status': { $in: ['Delivered', 'Shipped', 'Processing'] }
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        totalRevenue: { $sum: '$totalAmount' }
                    } 
                }
            ]),
            
            // Pending orders (items with Pending or Processing status)
            Order.countDocuments({ 
                'items.status': { $in: ['Pending', 'Processing'] } 
            })
        ]);

        res.json({
            success: true,
            data: {
                totalCustomers,
                totalOrders,
                totalRevenue: revenueData[0]?.totalRevenue || 0,
                pendingOrders
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
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

        res.json({
            success: true,
            data: { labels, salesData }
        });
    } catch (error) {
        console.error('Error fetching sales data:', error);
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
// GET REVENUE DISTRIBUTION BY PAYMENT METHOD
// ============================================
const getRevenueDistribution = async (req, res) => {
    try {
        const distribution = await Order.aggregate([
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

        const totalRevenue = distribution.reduce((sum, item) => sum + item.totalRevenue, 0);

        const formattedData = distribution.map(item => ({
            paymentMethod: item._id || 'Unknown',
            revenue: item.totalRevenue,
            percentage: totalRevenue > 0 ? ((item.totalRevenue / totalRevenue) * 100).toFixed(2) : '0.00'
        }));

        res.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Error fetching revenue distribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching revenue distribution'
        });
    }
};

// ============================================
// GET BEST SELLING PRODUCTS (TOP 5)
// ============================================
const getBestSellingProducts = async (req, res) => {
    try {
        const bestProducts = await Order.aggregate([
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
            { $limit: 5 },
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
                    totalQuantity: 1,
                    totalRevenue: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: bestProducts
        });
    } catch (error) {
        console.error('Error fetching best selling products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling products'
        });
    }
};

// ============================================
// GET BEST SELLING CATEGORY
// ============================================
const getBestSellingCategory = async (req, res) => {
    try {
        const bestCategory = await Order.aggregate([
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

        res.json({
            success: true,
            data: bestCategory[0] || null
        });
    } catch (error) {
        console.error('Error fetching best selling category:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching best selling category'
        });
    }
};

// ============================================
// GET BEST SELLING BRAND
// ============================================
const getBestSellingBrand = async (req, res) => {
    try {
        const bestBrand = await Order.aggregate([
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

        res.json({
            success: true,
            data: bestBrand[0] || null
        });
    } catch (error) {
        console.error('Error fetching best selling brand:', error);
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
        const { timePeriod, paymentMethod, orderStatus } = req.query;
        
        // TODO: Implement PDF generation logic using PDFKit or Puppeteer
        // This is a placeholder implementation
        
        res.json({
            success: true,
            message: 'PDF export functionality - to be implemented with PDFKit/Puppeteer'
        });
    } catch (error) {
        console.error('Error exporting ledger PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting ledger report'
        });
    }
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
    getDashboardStats,
    getSalesData,
    getRevenueDistribution,
    getBestSellingProducts,
    getBestSellingCategory,
    getBestSellingBrand,
    exportLedgerPDF
};
