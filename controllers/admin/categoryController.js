const Category = require('../../models/Category');
const { getPagination } = require('../../utils/pagination');

// Render EJS page
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
      Category.find(query).populate('parent', 'name').sort({ createdAt: -1 }),
      Category,
      query,
      page,
      limit
    );

    const allCategories = await Category.find({ isDeleted: false }); // for parent dropdown

    res.render('admin/categories', {
      categories,
      allCategories, // 👈 for parent dropdown
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

// JSON API - Fetch category list (AJAX)
exports.apiCategories = async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const parentFilter = req.query.parent;

    const query = {
      name: { $regex: q, $options: 'i' },
      isDeleted: false
    };

    // ✅ Enhanced parent filtering logic
    if (parentFilter === 'none') {
      query.parent = null; // main categories only
    } else if (parentFilter === 'sub') {
      query.parent = { $ne: null }; // only subcategories
    } else if (parentFilter) {
      query.parent = parentFilter; // filter by specific parent ID
    }

    const { data: categories, totalPages } = await getPagination(
      Category.find(query).populate('parent', 'name').sort({ createdAt: -1 }),
      Category,
      query,
      page,
      limit
    );

    const allCategories = await Category.find({ isDeleted: false });

    res.json({ categories, allCategories, currentPage: page, totalPages });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};



// Create category (AJAX)
exports.apiCreateCategory = async (req, res) => {
  try {
    const { name, description, parent } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    await Category.create({ name, description, parent: parent || null });
    res.json({ success: true });
  } catch (err) {
    console.error('Create Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// Update category (AJAX)
exports.apiUpdateCategory = async (req, res) => {
  try {
    const { name, description, parent } = req.body;

    await Category.findByIdAndUpdate(req.params.id, {
      name,
      description,
      parent: parent || null
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// Toggle category status
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

// Soft delete category
exports.apiSoftDeleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};
