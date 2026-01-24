const Coupon = require('../../models/Coupon');


const loadCouponPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8; // 12 coupons per page
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.status || 'all';
    
    // Build query
    let query = {};
    
    // Search filter
    if (searchQuery) {
      query.$or = [
        { code: { $regex: searchQuery, $options: 'i' } },
        { name: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (statusFilter === 'active') {
      query.isActive = true;
      query.validTo = { $gte: new Date() };
    } else if (statusFilter === 'inactive') {
      query.isActive = false;
    } else if (statusFilter === 'expired') {
      query.validTo = { $lt: new Date() };
    }
    
    // Pagination
    const totalCoupons = await Coupon.countDocuments(query);
    const totalPages = Math.ceil(totalCoupons / limit);
    const skip = (page - 1) * limit;
    
    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Generate page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    res.render('admin/coupons', {
      title: 'Coupon Management',
      coupons,
      count: totalCoupons,
      searchQuery,
      statusFilter,
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      pageNumbers
    });
  } catch (error) {
    console.error('Error loading coupon page:', error);
    res.status(500).render('admin/error', {
      title: 'Error',
      message: 'Failed to load coupons'
    });
  }
};


const getAllCouponsAPI = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const searchQuery = req.query.q || '';
        const statusFilter = req.query.status || 'all';
        
        // Build query (same as loadCouponPage)
        let query = {};
        
        // Search filter
        if (searchQuery) {
            query.$or = [
                { code: { $regex: searchQuery, $options: 'i' } },
                { name: { $regex: searchQuery, $options: 'i' } }
            ];
        }
        
        // Status filter
        if (statusFilter === 'active') {
            query.isActive = true;
            query.validTo = { $gte: new Date() };
        } else if (statusFilter === 'inactive') {
            query.isActive = false;
        } else if (statusFilter === 'expired') {
            query.validTo = { $lt: new Date() };
        }
        
        // Pagination
        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit) || 1; // At least 1 page
        const skip = (page - 1) * limit;
        
        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            message: 'Coupons fetched successfully',
            data: {
                coupons: coupons,
                count: coupons.length,
                totalCount: totalCoupons,
                pagination: {
                    currentPage: page,
                    totalPages,
                    hasPrevPage: page > 1,
                    hasNextPage: page < totalPages,
                    prevPage: page - 1,
                    nextPage: page + 1
                }
            }
        });

    } catch (error) {
        console.error('Error fetching coupons via API:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching coupons',
            error: error.message
        });
    }
};


// create new coupon
const createCoupon = async (req, res) => {
    try {
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
            validTo,
            isActive
        } = req.body;

        if (!code || !name || !discountType || !discountValue || !validFrom || !validTo) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required',
                errors: {
                    code: !code ? 'Coupon code is required' : '',
                    name: !name ? 'Coupon name is required' : '',
                    discountType: !discountType ? 'Discount type is required' : '',
                    discountValue: !discountValue ? 'Discount value is required' : '',
                    validFrom: !validFrom ? 'Valid from date is required' : '',
                    validTo: !validTo ? 'Valid to date is required' : ''
                }
            });
        }

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists',
                errors: {
                    code: 'This coupon code is already in use'
                }
            });
        }

        // Date range validation
        const fromDate = new Date(validFrom);
        const toDate = new Date(validTo);
        if (fromDate > toDate) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date range',
                errors: {
                    validTo: 'End date must be after start date'
                }
            });
        }

        // Create coupon object
        const couponData = {
            code: code.toUpperCase(),
            name,
            description,
            discountType,
            discountValue: parseFloat(discountValue),
            minimumOrderValue: parseFloat(minimumOrderValue) || 0,
            userLimit: parseInt(userLimit) || 1,
            usageLimit: Infinity,
            validFrom: fromDate,
            validTo: toDate,
            isActive: Boolean(isActive),
            createdBy: req.user ? req.user._id: null
        };

        if (usageLimit && usageLimit !== '' && !isNaN(usageLimit)) {
            couponData.usageLimit = parseInt(usageLimit);
        } else {
            couponData.usageLimit = Infinity;
        }

        if(maximumDiscountAmount && discountType === 'percentage') {
            couponData.maximumDiscountAmount = parseFloat(maximumDiscountAmount);
        }

        // Create and save coupon
        const newCoupon = new Coupon(couponData);
        const savedCoupon = await newCoupon.save();

        console.log ('New coupon created:', savedCoupon.code);

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            data: {
                coupon: savedCoupon
            }
        });

    } catch (error) {
        console.error('Error creating coupon:', error);

        if (error.name === 'ValidationError') {
            const errors = {};
            for (let field in error.errors) {
                errors[field] = error.errors[field].message;
            }
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error creating coupon',
            error: error.message
        });
    }
}

// get individual coupon details
const getCouponById = async (req, res) => {
    try {
        const { id } = req.params;

        // validate objectId
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon ID format'
            });
        }

        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        console.log('Coupon fetched for editing:', coupon.code);

        res.status(200).json({
            success: true,
            message: 'Coupon details retrieved successfully',
            data: {
                coupon: coupon
            }
        });

    } catch (error) {
        console.error('Error fetching coupon by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching coupon details',
            error: error.message
        });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
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
            validTo,
            isActive
        } = req.body;

        // Validate objectID
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon ID format'
            });
        }

        // Basic validation
        if (!code || !name || !discountType || !discountValue || !validFrom || !validTo) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                errors: {
                    code: !code ? 'Coupon code is required' : '',
                    name: !name ? 'Coupon name is required' : '',
                    discountType: !discountType ? 'Discount type is required' : '',
                    discountValue: !discountValue ? 'Discount value is required' : '',
                    validFrom: !validFrom ? 'Valid from date is required' : '',
                    validTo: !validTo ? 'Valid to date is required' : ''
                }
            });
        }

        // check if coupon exists
        const existingCoupon = await Coupon.findById(id);
        if (!existingCoupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // check if coupon code is already in use
        const codeUpperCase = code.toUpperCase();
        const duplicateCode = await Coupon.findOne({
            code: codeUpperCase,
            _id: { $ne: id }
        });

        if (duplicateCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already in use',
                errors: {
                    code: 'This code is already used in another coupon'
                }
            });
        }

        // validate date range
        const fromDate = new Date (validFrom);
        const toDate = new Date (validTo);
        if (fromDate > toDate) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date range',
                errors: {
                    validTo: 'End date must come after start date'
                }
            });
        }

        const updateData = {
            code: codeUpperCase,
            name: name.trim(),
            description: description ? description.trim() : '',
            discountType,
            discountValue: parseFloat(discountValue),
            minimumOrderValue: parseFloat(minimumOrderValue) || 0,
            usageLimit: Infinity,
            userLimit: parseInt(userLimit) || 1,
            validFrom: fromDate,
            validTo: toDate,
            isActive: Boolean(isActive)
        };

        // optional field type check
        if (usageLimit && usageLimit !== '' && !isNaN(usageLimit)) {
            updateData.usageLimit = parseInt(usageLimit);
        }

        if (maximumDiscountAmount && discountType === 'percentage') {
            updateData.maximumDiscountAmount = parseFloat(maximumDiscountAmount);
        }

        // update the coupon
        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        console.log('Coupon updated:', updateCoupon.code);

        res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            data: {
                coupon: updatedCoupon
            }
        });

    } catch (error) {
        console.error('Error updating coupon:', error);

        if (error.name === 'ValidationError') {
            const errors = {};
            for (let field in error.errors) {
                errors[field] = error.errors[field].message;
            }
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error updating coupon',
            error: error.message
        });
    }
}

const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // validate object id
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon ID format'
            });
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // toggle the status
        const newStatus = !coupon.isActive;
        coupon.isActive = newStatus;
        await coupon.save();

        console.log(`Coupon ${coupon.code} status set to ${newStatus} ? 'Active' : 'Inactive'`);

        res.status(200).json({
            success: true,
            message: `Coupon ${newStatus ? 'Activated' : 'Deactivated'} successfully`,
            data: {
                coupon: {
                    _id: coupon.id,
                    code: coupon.code,
                    name: coupon.name,
                    isActive: coupon.isActive
                }
            }
        });

    } catch (error) {
        console.error('Error toggling coupon status:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating coupon status',
            error: error.message
        });
    }
}

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        const deletedCouponInfo = {
            _id: coupon._id,
            code: coupon.code,
            name: coupon.name,
            usedCount: coupon.usedCount
        };

        await Coupon.findByIdAndDelete(id);

        console.log(`Coupon ${coupon.code} deleted successfully`);

        res.status(200).json({
            success: true,
            message: `Deleted Coupon: ${coupon.code}`,
            data: {
                deletedCoupon: deletedCouponInfo
            }
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);

        res.status(500).json({
            success: false,
            message: 'Error deleting coupon',
            error: error.message
        });
    }
}

module.exports = {
    loadCouponPage,
    getAllCouponsAPI,
    createCoupon,
    getCouponById,
    updateCoupon,
    toggleCouponStatus,
    deleteCoupon
}