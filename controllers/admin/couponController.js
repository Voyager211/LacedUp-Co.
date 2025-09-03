const Coupon = require('../../models/Coupon');
const { body, validationResult } = require('express-validator');
const { getPagination } = require('../../utils/pagination');

// Get all coupons with pagination
// Get all coupons with pagination
const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        // Build filter object
        const filter = {};
        if (req.query.status) {
            filter.isActive = req.query.status === 'active';
        }
        if (req.query.search) {
            filter.$or = [
                { code: new RegExp(req.query.search, 'i') },
                { name: new RegExp(req.query.search, 'i') },
                { description: new RegExp(req.query.search, 'i') }
            ];
        }
        if (req.query.discountType) {
            filter.discountType = req.query.discountType;
        }

        // Build sort options
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const sortOptions = { [sortBy]: sortOrder };

        // Use pagination utility
        const queryBuilder = Coupon.find(filter)
            .populate('createdBy', 'name email')
            .sort(sortOptions);

        const { data: coupons, totalPages } = await getPagination(
            queryBuilder, Coupon, filter, page, limit
        );

        // Calculate statistics
        const [
            activeCoupons,
            totalCouponsCount,
            totalUsageData,
            totalSavingsData
        ] = await Promise.all([
            Coupon.countDocuments({ isActive: true }),
            Coupon.countDocuments(filter),
            Coupon.aggregate([
                { $group: { _id: null, total: { $sum: '$usedCount' } } }
            ]),
            Coupon.aggregate([
                { $group: { _id: null, total: { $sum: { $multiply: ['$usedCount', '$discountValue'] } } } }
            ])
        ]);

        res.render('admin/coupons', {
            coupons,
            currentPage: page,
            totalPages,
            totalCoupons: totalCouponsCount,
            activeCoupons,
            totalUsage: totalUsageData[0]?.total || 0,
            totalSavings: totalSavingsData[0]?.total || 0,
            filters: {
                status: req.query.status || '',
                discountType: req.query.discountType || '',
                search: req.query.search || '',
                sortBy: req.query.sortBy || 'createdAt',
                sortOrder: req.query.sortOrder || 'desc'
            },
            title: 'Coupon Management'
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).render('errors/server-error', {
            title: 'Server Error'
        });
    }
};

// Get filtered coupons API endpoint
const getFilteredCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        // Build filter object
        const filter = {};
        
        // Status filter
        if (req.query.status) {
            filter.isActive = req.query.status === 'active';
        }
        
        // Discount type filter
        if (req.query.discountType) {
            filter.discountType = req.query.discountType;
        }

        // Search functionality
        if (req.query.search) {
            filter.$or = [
                { code: new RegExp(req.query.search, 'i') },
                { name: new RegExp(req.query.search, 'i') },
                { description: new RegExp(req.query.search, 'i') }
            ];
        }

        // Date range filter (for validity)
        if (req.query.dateRange) {
            const now = new Date();
            let startDate;
            
            switch (req.query.dateRange) {
                case 'active':
                    filter.validFrom = { $lte: now };
                    filter.validTo = { $gte: now };
                    break;
                case 'expired':
                    filter.validTo = { $lt: now };
                    break;
                case 'upcoming':
                    filter.validFrom = { $gt: now };
                    break;
            }
        }

        // Build sort options
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const sortOptions = { [sortBy]: sortOrder };

        // Use pagination utility
        const queryBuilder = Coupon.find(filter)
            .populate('createdBy', 'name email')
            .sort(sortOptions);

        const { data: coupons, totalPages } = await getPagination(
            queryBuilder, Coupon, filter, page, limit
        );

        // Calculate statistics for filtered results
        const [
            activeCoupons,
            totalCouponsCount,
            totalUsageData,
            totalSavingsData
        ] = await Promise.all([
            Coupon.countDocuments({ ...filter, isActive: true }),
            Coupon.countDocuments(filter),
            Coupon.aggregate([
                { $match: filter },
                { $group: { _id: null, total: { $sum: '$usedCount' } } }
            ]),
            Coupon.aggregate([
                { $match: filter },
                { $group: { _id: null, total: { $sum: { $multiply: ['$usedCount', '$discountValue'] } } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                coupons,
                currentPage: page,
                totalPages,
                totalCoupons: totalCouponsCount,
                activeCoupons,
                totalUsage: totalUsageData[0]?.total || 0,
                totalSavings: totalSavingsData[0]?.total || 0,
                filters: {
                    status: req.query.status || '',
                    discountType: req.query.discountType || '',
                    search: req.query.search || '',
                    dateRange: req.query.dateRange || '',
                    sortBy: req.query.sortBy || 'createdAt',
                    sortOrder: req.query.sortOrder || 'desc'
                }
            }
        });

    } catch (error) {
        console.error('Error fetching filtered coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching coupons'
        });
    }
};


// Create new coupon
const createCoupon = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }
        
        const {
            code,
            name,
            description,
            discountType,
            discountValue,
            minimumOrderValue,
            maximumDiscountAmount,
            usageLimit,
            userLimit,
            validFrom,
            validTo
        } = req.body;
        
        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ 
            code: code.toUpperCase() 
        });
        
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }
        
        const coupon = new Coupon({
            code: code.toUpperCase(),
            name,
            description,
            discountType,
            discountValue: parseFloat(discountValue),
            minimumOrderValue: parseFloat(minimumOrderValue) || 0,
            maximumDiscountAmount: maximumDiscountAmount ? parseFloat(maximumDiscountAmount) : null,
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            userLimit: parseInt(userLimit) || 1,
            validFrom: new Date(validFrom),
            validTo: new Date(validTo),
            createdBy: req.user.id
        });
        
        await coupon.save();
        
        res.json({
            success: true,
            message: 'Coupon created successfully',
            coupon
        });
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating coupon'
        });
    }
};

// Toggle coupon status
const toggleCouponStatus = async (req, res) => {
    try {
        const { couponId } = req.params;
        
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        
        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating coupon status'
        });
    }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;
        
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        
        // Check if coupon has been used
        if (coupon.usedCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete coupon that has been used'
            });
        }
        
        await Coupon.findByIdAndDelete(couponId);
        
        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting coupon'
        });
    }
};

// Validation rules for coupon creation
const couponValidationRules = [
    body('code')
        .notEmpty()
        .withMessage('Coupon code is required')
        .isLength({ min: 3, max: 20 })
        .withMessage('Coupon code must be between 3 and 20 characters')
        .matches(/^[A-Z0-9]+$/)
        .withMessage('Coupon code can only contain uppercase letters and numbers'),
    
    body('name')
        .notEmpty()
        .withMessage('Coupon name is required')
        .isLength({ max: 100 })
        .withMessage('Coupon name cannot exceed 100 characters'),
    
    body('discountType')
        .isIn(['percentage', 'fixed'])
        .withMessage('Discount type must be either percentage or fixed'),
    
    body('discountValue')
        .isFloat({ min: 0.01 })
        .withMessage('Discount value must be greater than 0'),
    
    body('validFrom')
        .isISO8601()
        .withMessage('Valid from date is required'),
    
    body('validTo')
        .isISO8601()
        .withMessage('Valid to date is required')
        .custom((validTo, { req }) => {
            if (new Date(validTo) <= new Date(req.body.validFrom)) {
                throw new Error('Valid to date must be after valid from date');
            }
            return true;
        })
];

module.exports = {
    getCoupons,
    getFilteredCoupons, 
    // getCouponStatistics,
    createCoupon,
    toggleCouponStatus,
    deleteCoupon,
    couponValidationRules
};