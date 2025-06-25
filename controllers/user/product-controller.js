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
      isBlocked: false
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
    const brands = await Product.distinct('brand', { isDeleted: false, isBlocked: false });

    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    const filter = { isDeleted: false, isBlocked: false };

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