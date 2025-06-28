const Product = require('../../models/Product');
const Category = require('../../models/Category');
const { processImages } = require('../../utils/imageProcessor');
const { getPagination } = require('../../utils/pagination');
const sharp = require('sharp');

// List all products (page render)
exports.listProducts = async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const query = { productName: { $regex: q, $options: 'i' }, isDeleted: false };

    // Get total count of all non-deleted products
    const totalProductCount = await Product.countDocuments({ isDeleted: false });

    const { data: products, totalPages } = await getPagination(
      Product.find(query).populate('category').sort({ createdAt: -1 }),
      Product,
      query,
      page,
      limit
    );
    const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });

    res.render('admin/products', {
      products,
      categories,
      currentPage: page,
      totalPages,
      searchQuery: q,
      totalProductCount,
      title: "Product Management"
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

// Render add product page
exports.renderAddPage = async (req, res) => {
  const categories = await Category.find({ isDeleted: false });
  res.render('admin/add-product', {
    title: "Add Product",
    categories
  });
};

// API: Create new product via base64 images (fetch-based)
exports.apiSubmitNewProduct = async (req, res) => {
  try {
    let base64Images = req.body.base64Images || [];
    if (!Array.isArray(base64Images)) base64Images = [base64Images];

    if (base64Images.length < 3) {
      return res.status(400).json({ success: false, message: 'Minimum 3 images required.' });
    }

    const mainImageIndex = parseInt(req.body.mainImageIndex || '0', 10);

    const saveBase64Image = async (base64, index) => {
      const buffer = Buffer.from(base64.split(',')[1], 'base64');
      const filename = `${Date.now()}-${index}.webp`;
      const outputPath = `public/uploads/products/${filename}`;
      await sharp(buffer).resize(800, 800).webp().toFile(outputPath);
      return `/uploads/products/${filename}`;
    };

    const savedUrls = await Promise.all(base64Images.map(saveBase64Image));
    const mainImage = savedUrls[mainImageIndex] || savedUrls[0];
    const subImages = savedUrls.filter((_, i) => i !== mainImageIndex);

    await Product.create({
      productName: req.body.productName,
      description: req.body.description,
      brand: req.body.brand,
      category: req.body.category,
      regularPrice: req.body.regularPrice,
      salePrice: req.body.salePrice,
      productOffer: req.body.productOffer || 0,
      features: req.body.features,
      stock: req.body.stock,
      mainImage,
      subImages,
    });

    res.status(200).json({ success: true, message: 'Product added successfully!' });

  } catch (err) {
    console.error('❌ API Submit Error:', err);
    res.status(500).json({ success: false, message: 'Server error while adding product.' });
  }
};


// Soft delete a product (form submit)
exports.softDeleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting Product");
  }
};

// API: List products (fetch)
exports.apiProducts = async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Build query object with advanced filters
    const query = { isDeleted: false };

    // Search filter
    if (q) {
      query.productName = { $regex: q, $options: 'i' };
    }

    // Category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Brand filter
    if (req.query.brand) {
      query.brand = { $regex: req.query.brand, $options: 'i' };
    }

    // Price range filters
    if (req.query.minPrice || req.query.maxPrice) {
      query.salePrice = {};
      if (req.query.minPrice) {
        query.salePrice.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        query.salePrice.$lte = parseFloat(req.query.maxPrice);
      }
    }

    // Status filter
    if (req.query.status !== undefined && req.query.status !== '') {
      query.isListed = req.query.status === 'true';
    }

    // Stock filter
    if (req.query.stock) {
      switch (req.query.stock) {
        case 'in-stock':
          query.stock = { $gt: 0 };
          break;
        case 'low-stock':
          query.stock = { $gt: 0, $lt: 10 };
          break;
        case 'out-of-stock':
          query.stock = 0;
          break;
      }
    }

    // Build sort object
    let sortQuery = { createdAt: -1 }; // default sort
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'name-asc':
          sortQuery = { productName: 1 };
          break;
        case 'name-desc':
          sortQuery = { productName: -1 };
          break;
        case 'price-asc':
          sortQuery = { salePrice: 1 };
          break;
        case 'price-desc':
          sortQuery = { salePrice: -1 };
          break;
        case 'date-newest':
          sortQuery = { createdAt: -1 };
          break;
        case 'date-oldest':
          sortQuery = { createdAt: 1 };
          break;
        case 'status':
          sortQuery = { isListed: -1, createdAt: -1 };
          break;
      }
    }

    // Get total count of all non-deleted products
    const totalProductCount = await Product.countDocuments({ isDeleted: false });

    const { data: products, totalPages } = await getPagination(
      Product.find(query).populate('category').sort(sortQuery),
      Product,
      query,
      page,
      limit
    );
    res.json({ products, totalPages, currentPage: page, totalProductCount });
  } catch (err) {
    console.error('Fetch Products Error:', err);
    res.status(500).json({ success: false });
  }
};

// API: Create product (file upload/multer)
exports.apiCreateProduct = async (req, res) => {
  try {
    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ success: false, message: 'Minimum 3 images required' });
    }
    const images = await processImages(req.files);
    await Product.create({
      productName: req.body.name,
      description: req.body.description,
      regularPrice: req.body.regularPrice,
      salePrice: req.body.salePrice,
      stock: req.body.stock,
      category: req.body.category,
      mainImage: images[0],
      subImages: images.slice(1)
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Create Product Error:', err);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
};

// API: Update product (fetch)
exports.apiUpdateProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, {
      productName: req.body.name,
      description: req.body.description,
      regularPrice: req.body.regularPrice,
      salePrice: req.body.salePrice,
      stock: req.body.stock,
      category: req.body.category
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Update Product Error:', err);
    res.status(500).json({ success: false });
  }
};

// API: Soft delete (fetch)
exports.apiSoftDeleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Soft Delete Product Error:', err);
    res.status(500).json({ success: false });
  }
};

// API: Toggle product status (fetch)
exports.apiToggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      product.isListed = !product.isListed;
      product.status = product.isListed ? 'Available' : 'Not Available';
      await product.save();
      return res.json({ success: true });
    } else {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
  } catch (err) {
    console.error('Toggle Product Status Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


// Render edit product page
exports.renderEditPage = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });

    if (!product) return res.status(404).send('Product not found');

    res.render('admin/edit-product', {
      title: 'Edit Product',
      product,
      categories
    });
  } catch (err) {
    console.error('Render Edit Error:', err);
    res.status(500).send("Error rendering edit page");
  }
};

exports.apiUpdateProduct = async (req, res) => {
  try {
    const base64Images = req.body.base64Images || [];
    const productId = req.params.id;

    if (!Array.isArray(base64Images) || base64Images.length < 3) {
      return res.status(400).json({ success: false, message: 'Minimum 3 images required.' });
    }

    const mainImageIndex = parseInt(req.body.mainImageIndex || '0', 10);

    const saveBase64Image = async (base64, index) => {
      const buffer = Buffer.from(base64.split(',')[1], 'base64');
      const filename = `${Date.now()}-${index}.webp`;
      const outputPath = `public/uploads/products/${filename}`;
      await sharp(buffer).resize(800, 800).webp().toFile(outputPath);
      return `/uploads/products/${filename}`;
    };

    const savedUrls = await Promise.all(base64Images.map(saveBase64Image));
    const mainImage = savedUrls[mainImageIndex] || savedUrls[0];
    const subImages = savedUrls.filter((_, i) => i !== mainImageIndex);

    await Product.findByIdAndUpdate(productId, {
      productName: req.body.productName,
      description: req.body.description,
      brand: req.body.brand,
      category: req.body.category,
      regularPrice: req.body.regularPrice,
      salePrice: req.body.salePrice,
      productOffer: req.body.productOffer || 0,
      features: req.body.features,
      stock: req.body.stock,
      mainImage,
      subImages,
    });

    res.status(200).json({ success: true, message: 'Product Edited Successfully!' });

  } catch (err) {
    console.error('❌ API Edit Error:', err);
    res.status(500).json({ success: false, message: 'Server error while editing product.' });
  }
};
