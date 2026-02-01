const Brand = require('../../models/Brand');
const getPagination = require('../../utils/pagination');
const { validateBase64Image } = require('../../utils/imageValidation');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// List brands with search and filter
const listBrands = async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Build filter query
    const query = {
      name: { $regex: searchQuery, $options: 'i' },
      isDeleted: false
    };

    // Apply status filter
    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'inactive') {
      query.isActive = false;
    }

    const totalRecords = await Brand.countDocuments(query);

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
      totalRecords,
      searchQuery,
      statusFilter,
      title: 'Brand Management'
    });
  } catch (error) {
    console.error('Error listing brands:', error);
    res.status(500).render('admin/brands', {
      brands: [],
      currentPage: 1,
      totalPages: 1,
      totalRecords: 0,
      searchQuery: '',
      statusFilter: 'all',
      title: 'Brand Management',
      error: 'Failed to load brands'
    });
  }
};

// Fetch-based brand listing
const apiBrands = async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Build filter query
    const query = {
      name: { $regex: searchQuery, $options: 'i' },
      isDeleted: false
    };

    // Apply status filter
    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'inactive') {
      query.isActive = false;
    }

    const totalRecords = await Brand.countDocuments(query);

    const { data: brands, totalPages } = await getPagination(
      Brand.find(query).sort({ createdAt: -1 }),
      Brand,
      query,
      page,
      limit
    );

    res.json({
      brands,
      currentPage: page,
      totalPages,
      totalRecords
    });
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Get single brand
const apiGetBrand = async (req, res) => {
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

// Add brand via fetch with image upload
const apiCreateBrand = async (req, res) => {
  try {
    const { name, description, brandOffer, base64Image } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Brand name cannot be empty' });
    }

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

    // Process image if provided
    let imageUrl = '';
    if (base64Image) {
      // Validate image
      const validation = validateBase64Image(base64Image);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Save and process image
      const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
      const filename = `brand-${Date.now()}.webp`;
      const uploadsDir = path.join('public', 'uploads', 'brands');
      
      // Ensure directory exists
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const outputPath = path.join(uploadsDir, filename);
      
      await sharp(buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toFile(outputPath);
      
      imageUrl = `/uploads/brands/${filename}`;
    }

    await Brand.create({
      name: trimmedName,
      description: description || '',
      brandOffer: Math.max(0, Math.min(100, parseFloat(brandOffer) || 0)),
      image: imageUrl
    });

    res.json({ success: true, message: 'Brand created successfully' });
  } catch (err) {
    console.error('Create Error:', err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to create brand' });
  }
};

// Update brand via fetch with image upload
const apiUpdateBrand = async (req, res) => {
  try {
    const { name, description, brandOffer, base64Image } = req.body;
    const brandId = req.params.id;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Brand name cannot be empty' });
    }

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

    const brand = await Brand.findById(brandId);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    // Process new image if provided
    let imageUrl = brand.image || '';
    if (base64Image) {
      // Validate image
      const validation = validateBase64Image(base64Image);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Delete old image if exists
      if (brand.image) {
        const oldImagePath = path.join('public', brand.image);
        try {
          await fs.unlink(oldImagePath);
        } catch (err) {
          console.log('Old image not found or already deleted:', err.message);
        }
      }

      // Save new image
      const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
      const filename = `brand-${Date.now()}.webp`;
      const uploadsDir = path.join('public', 'uploads', 'brands');
      
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const outputPath = path.join(uploadsDir, filename);
      
      await sharp(buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toFile(outputPath);
      
      imageUrl = `/uploads/brands/${filename}`;
    }

    await Brand.findByIdAndUpdate(brandId, {
      name: trimmedName,
      description: description || '',
      brandOffer: Math.max(0, Math.min(100, parseFloat(brandOffer) || 0)),
      image: imageUrl
    });

    res.json({ success: true, message: 'Brand updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A brand with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to update brand' });
  }
};

// Toggle brand status
const apiToggleStatus = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    brand.isActive = !brand.isActive;
    await brand.save();

    res.json({
      success: true,
      message: `Brand ${brand.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: brand.isActive
    });
  } catch (err) {
    console.error('Toggle Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
};

// Soft delete via fetch
const apiSoftDeleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    await Brand.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true, message: 'Brand deleted successfully' });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete brand' });
  }
};

module.exports = {
  listBrands,
  apiBrands,
  apiGetBrand,
  apiCreateBrand,
  apiUpdateBrand,
  apiToggleStatus,
  apiSoftDeleteBrand
};
