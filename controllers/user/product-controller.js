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

    const filter = {
      isDeleted: false,
      isListed: true
    };

    if (category) filter.category = category;
    if (brand) filter.brand = { $regex: brand, $options: 'i' };
    if (search) {
      // First, find categories that match the search term
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
    const brands = await Product.distinct('brand', { isDeleted: false, isListed: true });

    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    const filter = { isDeleted: false, isListed: true };

    const { data: paginatedProducts, totalPages } = await getPagination(
      Product.find(filter).sort({ createdAt: -1 }),
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

    // Simplified filter - try to match the working main search logic exactly
    const filter = {
      isDeleted: false,
      isListed: true,
      $or: [
        { productName: { $regex: query, $options: 'i' } },
        { brand: { $regex: query, $options: 'i' } }
      ]
    };

    // Get limited results for suggestions (8 products max)
    const suggestions = await Product.find(filter)
      .populate({ path: 'category', select: 'name' })
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

    if (!product) {
      return res.status(404).render('error', { message: 'Product not found' });
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
        isBlocked: false,
        isListed: true
      })
        .populate({
          path: 'category',
          match: { isActive: true },
          select: 'name'
        })
        .sort({ createdAt: -1 })
        .limit(4)
        .lean();

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
    res.status(500).render('error', {
      message: 'Internal server error'
    });
  }
};


