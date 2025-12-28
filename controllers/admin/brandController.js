const Brand = require('../../models/Brand');
const getPagination = require('../../utils/pagination');

exports.listBrands = async (req, res) => {
    try {
        const q = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const query = {
            name: { $regex: q, $options: 'i' },
            isDeleted: false
        };

        const { data: brands, totalPages } = await getPagination(
            Brand.find(query).sort({ createdAt: -1 }),
            Brand,
            query,
            page,
            limit
        );

        res.render('admin/brands', {
            brands,
            currentPage: page,
            totalPages,
            searchQuery: q,
            title: "Brand Management"
        });
    } catch (error) {
        console.error('Error listing brands:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Fetch-based brand listing
exports.apiBrands = async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const query = {
      name: { $regex: q, $options: 'i' },
      isDeleted: false
    };

    const { data: brands, totalPages } = await getPagination(
      Brand.find(query).sort({ createdAt: -1 }),
      Brand,
      query,
      page,
      limit
    );

    res.json({ brands, currentPage: page, totalPages });
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Get single brand
exports.apiGetBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    res.json({ success: true, brand });
  } catch (err) {
    console.error('Error fetching brand:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// Add brand via fetch
exports.apiCreateBrand = async (req, res) => {
  try {
    const { name, description, brandOffer } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    // Trim and validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Brand name cannot be empty' });
    }

    // Check for case-insensitive uniqueness
    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      isDeleted: false
    });

    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    await Brand.create({
      name: trimmedName,
      description: description || '',
      brandOffer: Math.max(0, Math.min(100, parseFloat(brandOffer) || 0))
    });
    res.json({ success: true, message: 'Brand created successfully' });
  } catch (err) {
    console.error('Create Error:', err);

    // Handle MongoDB duplicate key error (in case the unique index catches it)
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to create brand' });
  }
};

// Update brand via fetch
exports.apiUpdateBrand = async (req, res) => {
  try {
    const { name, description, brandOffer } = req.body;
    const brandId = req.params.id;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    // Trim and validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Brand name cannot be empty' });
    }

    // Check for case-insensitive uniqueness (excluding current brand)
    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      isDeleted: false,
      _id: { $ne: brandId }
    });

    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    await Brand.findByIdAndUpdate(brandId, {
      name: trimmedName,
      description: description || '',
      brandOffer: Math.max(0, Math.min(100, parseFloat(brandOffer) || 0))
    });

    res.json({ success: true, message: 'Brand updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);

    // Handle MongoDB duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to update brand' });
  }
};

// Toggle status via fetch
exports.apiToggleStatus = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (brand) {
      brand.isActive = !brand.isActive;
      await brand.save();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Toggle Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
};

// Soft delete via fetch
exports.apiSoftDeleteBrand = async (req, res) => {
  try {
    await Brand.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete brand' });
  }
};