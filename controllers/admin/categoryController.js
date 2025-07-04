const Category = require('../../models/Category');
const { getPagination } = require('../../utils/pagination');

exports.listCategories = async (req, res) => {
    try {
        const q = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const query = {
            name: { $regex: q, $options: 'i' },
            isDeleted: false
        };

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
            searchQuery: q,
            title: "Category Management"
        });
    } catch (error) {
        console.error('Error listing categories:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Fetch-based category listing
exports.apiCategories = async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const query = {
      name: { $regex: q, $options: 'i' },
      isDeleted: false
    };

    const { data: categories, totalPages } = await getPagination(
      Category.find(query).sort({ createdAt: -1 }),
      Category,
      query,
      page,
      limit
    );

    res.json({ categories, currentPage: page, totalPages });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// exports.createCategory = async (req, res) => {
//     try {
//         await Category.create({
//             name: req.body.name,
//             description: req.body.description
//         });
//         res.redirect('/admin/categories');
//     } catch (error) {
//         console.error('Error creating category:', error);
//         res.status(500).send('Internal Server Error');
//     }
// };

// exports.toggleCategoryStatus = async (req, res) => {
//     try {
//         const category = await Category.findById(req.params.id);
//         if (category) {
//             category.isActive = !category.isActive;
//             await category.save();
//         }
//         res.redirect('/admin/categories');
//     } catch (error) {
//         console.error('Error toggling category status:', error);
//         res.status(500).send('Internal Server Error');
//     }
// };

// exports.updateCategory = async (req, res) => {
//     try {
//         await Category.findByIdAndUpdate(req.params.id, {
//             name: req.body.name,
//             description: req.body.description
//         });
//         res.redirect('/admin/categories');
//     } catch (error) {
//         console.error('Error updating category:', error);
//         res.status(500).send('Internal Server Error');
//     }
// };

// exports.softDeleteCategory = async (req, res) => {
//     try {
//         await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
//         res.redirect('/admin/categories');
//     } catch (error) {
//         console.error('Error soft deleting category:', error);
//         res.status(500).send('Internal Server Error');
//     }
// };

// Add category via fetch
exports.apiCreateCategory = async (req, res) => {
  try {
    const { name, description, categoryOffer } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    // Trim and validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
    }

    // Check for case-insensitive uniqueness
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

    await Category.create({
      name: trimmedName,
      description: description || '',
      categoryOffer: Math.max(0, Math.min(100, parseFloat(categoryOffer) || 0))
    });
    res.json({ success: true, message: 'Category created successfully' });
  } catch (err) {
    console.error('Create Error:', err);

    // Handle MongoDB duplicate key error (in case the unique index catches it)
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// Update category via fetch
exports.apiUpdateCategory = async (req, res) => {
  try {
    const { name, description, categoryOffer } = req.body;
    const categoryId = req.params.id;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    // Trim and validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
    }

    // Check for case-insensitive uniqueness (excluding current category)
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

    await Category.findByIdAndUpdate(categoryId, {
      name: trimmedName,
      description: description || '',
      categoryOffer: Math.max(0, Math.min(100, parseFloat(categoryOffer) || 0))
    });

    res.json({ success: true, message: 'Category updated successfully' });
  } catch (err) {
    console.error('Update Error:', err);

    // Handle MongoDB duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// Toggle status via fetch
exports.apiToggleStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (category) {
      category.isActive = !category.isActive;
      await category.save();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Toggle Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
};

// Soft delete via fetch
exports.apiSoftDeleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};