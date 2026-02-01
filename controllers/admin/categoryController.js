const Category = require('../../models/Category');
const getPagination = require('../../utils/pagination');
const { validateBase64Image } = require('../../utils/imageValidation');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// List categories with search and filter
const listCategories = async (req, res) => {
  try { 
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const query = {
      name: { $regex: searchQuery, $options: 'i' },
      isDeleted: false
    };

    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'inactive') {
      query.isActive = false;
    }

    const totalRecords = await Category.countDocuments(query);

    const { data: categories, totalPages } = await getPagination(
      Category.find(query).sort({ createdAt: -1 }),
      Category,
      query,
      page,
      limit
    );

    res.render('admin/categories', {
      categories,
      currentPage: page,
      totalPages,
      totalRecords,
      searchQuery,
      statusFilter,
      title: 'Category Management'
    });
  } catch (error) {
    console.error('Error listing categories:', error);
    res.status(500).render('admin/categories', {
      categories: [],
      currentPage: 1,
      totalPages: 1,
      totalRecords: 0,
      searchQuery: '',
      statusFilter: 'all',
      title: 'Category Management',
      error: 'Failed to load categories'
    });
  }
};

// Fetch-based category listing
const apiCategories = async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const query = {
      name: { $regex: searchQuery, $options: 'i' },
      isDeleted: false
    };

    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'inactive') {
      query.isActive = false;
    }

    const totalRecords = await Category.countDocuments(query);

    const { data: categories, totalPages } = await getPagination(
      Category.find(query).sort({ createdAt: -1 }),
      Category,
      query,
      page,
      limit
    );

    res.json({ 
      categories,
      currentPage: page,
      totalPages,
      totalRecords
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Get single category
const apiGetCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}; 

// Add category via fetch with image upload
const apiCreateCategory = async (req, res) => {
  try {
    const { name, description, categoryOffer, base64Image } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      isDeleted: false
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
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
      const filename = `category-${Date.now()}.webp`;
      const uploadsDir = path.join('public', 'uploads', 'categories');
      
      // Ensure directory exists
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const outputPath = path.join(uploadsDir, filename);
      
      await sharp(buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toFile(outputPath);
      
      imageUrl = `/uploads/categories/${filename}`;
    }

    await Category.create({
      name: trimmedName,
      description: description || '',
      categoryOffer: Math.max(0, Math.min(100, parseFloat(categoryOffer) || 0)),
      image: imageUrl
    });

    res.json({ success: true, message: 'Category created successfully' });
  } catch (err) {
    console.error('Create Error:', err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// Update category via fetch with image upload
const apiUpdateCategory = async (req, res) => {
  try {
    const { name, description, categoryOffer, base64Image } = req.body;
    const categoryId = req.params.id;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      isDeleted: false,
      _id: { $ne: categoryId }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    const category = await Category.findById(categoryId);
    if (!category || category.isDeleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Process new image if provided
    let imageUrl = category.image || '';
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
      if (category.image) {
        const oldImagePath = path.join('public', category.image);
        try {
          await fs.unlink(oldImagePath);
        } catch (err) {
          console.log('Old image not found or already deleted:', err.message);
        }
      }

      // Save new image
      const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
      const filename = `category-${Date.now()}.webp`;
      const uploadsDir = path.join('public', 'uploads', 'categories');
      
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const outputPath = path.join(uploadsDir, filename);
      
      await sharp(buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toFile(outputPath);
      
      imageUrl = `/uploads/categories/${filename}`;
    }

    await Category.findByIdAndUpdate(categoryId, {
      name: trimmedName,
      description: description || '',
      categoryOffer: Math.max(0, Math.min(100, parseFloat(categoryOffer) || 0)),
      image: imageUrl
    });

    res.json({ success: true, message: 'Category updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// Toggle category status
const apiToggleStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: category.isActive
    });
  } catch (err) {
    console.error('Toggle Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
};

// Soft delete via fetch
const apiSoftDeleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};

module.exports = {
  listCategories,
  apiCategories,
  apiGetCategory,
  apiCreateCategory,
  apiUpdateCategory,
  apiToggleStatus,
  apiSoftDeleteCategory
};
