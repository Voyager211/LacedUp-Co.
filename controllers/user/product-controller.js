const Product = require('../../models/Product');
const Review = require('../../models/Review'); // You’ll need to create this
const Category = require('../../models/Category');
const { getPagination } = require('../../utils/pagination');

exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    // Extract query parameters (matching frontend parameter names)
    const search = req.query.q || req.query.search || '';
    const category = req.query.category || '';
    const brand = req.query.brand || '';
    const sort = req.query.sort || 'newest';
    const minPrice = parseFloat(req.query.minPrice || req.query.min) || 0;
    const maxPrice = parseFloat(req.query.maxPrice || req.query.max) || 1e9;
    const sizes = req.query.size ? (Array.isArray(req.query.size) ? req.query.size : [req.query.size]) : [];

    // Get active category IDs to filter products
    const activeCategories = await Category.find({
      isDeleted: false,
      isActive: true
    }).select('_id').lean();
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    const filter = {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds } // Only products from active categories
    };

    if (category) {
      // Ensure the requested category is active
      const requestedCategory = await Category.findById(category).select('isActive isDeleted').lean();
      if (requestedCategory && !requestedCategory.isDeleted && requestedCategory.isActive) {
        filter.category = category;
      } else {
        // If requested category is inactive, return empty results
        return res.json({
          success: true,
          products: [],
          pagination: {
            totalPages: 0,
            totalProducts: 0,
            currentPage: page,
            hasNextPage: false,
            hasPrevPage: page > 1
          }
        });
      }
    }

    if (brand) filter.brand = { $regex: brand, $options: 'i' };
    if (search) {
      // First, find categories that match the search term (only active ones)
      const matchingCategories = await Category.find({
        name: { $regex: search, $options: 'i' },
        isDeleted: false,
        isActive: true
      }).select('_id');

      const categoryIds = matchingCategories.map(cat => cat._id);

      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        ...(categoryIds.length > 0 ? [{ category: { $in: categoryIds } }] : [])
      ];

      // Still need to ensure category is in active categories
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { category: { $in: activeCategoryIds } }
        ];
        delete filter.$or;
      }
    }

    // Price range filter
    filter.salePrice = { $gte: minPrice, $lte: maxPrice };

    // Size filter (if sizes are provided)
    if (sizes.length > 0) {
      // Assuming sizes are stored in a sizes array field in the product model
      // If sizes are stored differently, adjust this accordingly
      filter.sizes = { $in: sizes };
    }

    const sortMap = {
      'priceLow': { salePrice: 1 },
      'priceHigh': { salePrice: -1 },
      'nameAZ': { productName: 1 },
      'nameZA': { productName: -1 },
      'newest': { createdAt: -1 },
      'featured': { isFeatured: -1, createdAt: -1 },
      'popularity': { sold: -1 },
      'rating': { averageRating: -1 },
      // Keep backward compatibility
      'price-low': { salePrice: 1 },
      'price-high': { salePrice: -1 },
      'name-az': { productName: 1 },
      'name-za': { productName: -1 }
    };

    const sortQuery = sortMap[sort] || sortMap['newest'];

    const allProducts = await Product.find(filter)
      .populate({ path: 'category', match: { isActive: true }, select: 'name' })
      .sort(sortQuery)
      .lean();

    const filteredProducts = allProducts.filter(p => p.category !== null);
    const totalProducts = filteredProducts.length;
    const products = filteredProducts.slice(skip, skip + limit);

    const productsWithRatings = await Promise.all(
      products.map(async (product) => {
        const reviews = await Review.find({ product: product._id, isHidden: false });
        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;
        return { ...product, averageRating: avgRating, totalReviews };
      })
    );

    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      success: true,
      products: productsWithRatings,
      pagination: {
        totalPages,
        totalProducts: totalProducts,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Error in getProducts:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

exports.loadShopPage = async (req, res) => {
  try {
    const categories = await Category.find({ isDeleted: false, isActive: true }).lean();

    // Get active category IDs for filtering products
    const activeCategoryIds = categories.map(cat => cat._id);

    // Only get brands from products that belong to active categories
    const brands = await Product.distinct('brand', {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds }
    });

    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    // Filter products to only include those from active categories
    const filter = {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds }
    };

    const { data: paginatedProducts, totalPages } = await getPagination(
      Product.find(filter).populate('category').sort({ createdAt: -1 }),
      Product,
      filter,
      page,
      limit
    );

    res.render('user/shop', {
      title: 'Shop Sneakers',
      layout: 'user/layouts/user-layout',
      active: 'shop',
      categories,
      brands,
      products: paginatedProducts, // renamed correctly
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error('❌ Error loading shop page:', err);
    res.status(500).send('Internal Server Error');
  }
};

// API: Get search suggestions for dropdown
exports.getSearchSuggestions = async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query || query.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    // Get active category IDs to filter products
    const activeCategories = await Category.find({
      isDeleted: false,
      isActive: true
    }).select('_id').lean();
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    // Filter to only include products from active categories
    const filter = {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds },
      $or: [
        { productName: { $regex: query, $options: 'i' } },
        { brand: { $regex: query, $options: 'i' } }
      ]
    };

    // Get limited results for suggestions (8 products max)
    const suggestions = await Product.find(filter)
      .populate({
        path: 'category',
        match: { isActive: true, isDeleted: false },
        select: 'name'
      })
      .select('productName brand mainImage salePrice category slug')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    // Only include products that have a category
    const filteredSuggestions = suggestions.filter(p => p.category && p.category.name);

    res.json({
      success: true,
      suggestions: filteredSuggestions,
      query: query
    });

  } catch (err) {
    console.error('Error in getSearchSuggestions:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

// Product details page
exports.loadProductDetails = async (req, res) => {
  try {
    const productSlug = req.params.slug;

    // Find product by slug
    const product = await Product.findOne({ slug: productSlug })
      .populate('category')
      .lean();

    // Check if product exists and is not deleted
    if (!product || product.isDeleted) {
      return res.status(404).render('errors/404', {
        title: 'Product Not Found',
        message: 'The product you are looking for does not exist or has been removed.',
        layout: 'user/layouts/user-layout',
        active: 'shop'
      });
    }

    // Check if product is blocked/unlisted
    if (!product.isListed) {
      return res.status(404).render('errors/404', {
        title: 'Product Not Available',
        message: 'This product is currently not available.',
        layout: 'user/layouts/user-layout',
        active: 'shop'
      });
    }

    // Check if product's category exists and is active
    if (!product.category || product.category.isDeleted || !product.category.isActive) {
      return res.status(404).render('errors/404', {
        title: 'Product Not Available',
        message: 'This product is no longer available as its category has been disabled.',
        layout: 'user/layouts/user-layout',
        active: 'shop'
      });
    }

    const reviews = await Review.find({
      product: product._id,
      isHidden: false
    })
      .populate('user', 'fullname')
      .sort({ createdAt: -1 })
      .lean();

    // Related products from same category (excluding current product)
    let relatedProductsRaw = [];
    if (product.category && product.category.isActive) {
      relatedProductsRaw = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true // Fixed: removed isBlocked which doesn't exist
      })
        .populate({
          path: 'category',
          match: { isActive: true },
          select: 'name'
        })
        .sort({ createdAt: -1 })
        .limit(4)
        .lean();

      // Filter out products whose categories became null (inactive categories)
      relatedProductsRaw = relatedProductsRaw.filter(prod => prod.category !== null);
    }

    // Add rating stats to related products
    const relatedProducts = await Promise.all(
      relatedProductsRaw.map(async (relatedProduct) => {
        const relReviews = await Review.find({ product: relatedProduct._id, isHidden: false });
        const totalReviews = relReviews.length;
        const averageRating = totalReviews > 0
          ? relReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
          : 0;
        return {
          ...relatedProduct,
          averageRating,
          totalReviews
        };
      })
    );

    // Stats for current product
    const totalReviews = reviews.length;
    let averageRating = 0;
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      averageRating = totalRating / totalReviews;

      reviews.forEach(review => {
        ratingCounts[review.rating]++;
      });

      Object.keys(ratingBreakdown).forEach(rating => {
        ratingBreakdown[rating] = (ratingCounts[rating] / totalReviews) * 100;
      });
    }

    res.render('user/product-details', {
      title: product.productName,
      layout: 'user/layouts/user-layout',
      active: 'shop',
      product,
      reviews,
      relatedProducts,
      averageRating,
      totalReviews,
      ratingCounts,
      ratingBreakdown
    });

  } catch (err) {
    console.error('❌ Error loading product details:', err);
    res.status(500).render('errors/server-error', {
      title: 'Server Error',
      message: 'Something went wrong while loading the product details.',
      layout: 'user/layouts/user-layout',
      active: 'shop'
    });
  }
};


