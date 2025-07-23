const Product = require('../../models/Product');
const Review = require('../../models/Review'); // You'll need to create this
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
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

    if (brand) {
      // Handle multiple brand IDs (comma-separated)
      if (brand.includes(',')) {
        const brandIds = brand.split(',').filter(id => id.trim());
        filter.brand = { $in: brandIds };
      } else {
        filter.brand = brand;
      }
    }
    
    if (search) {
      // First, find categories that match the search term (only active ones)
      const matchingCategories = await Category.find({
        name: { $regex: search, $options: 'i' },
        isDeleted: false,
        isActive: true
      }).select('_id');

      const categoryIds = matchingCategories.map(cat => cat._id);

      // Find brands that match the search term (only active ones)
      const matchingBrands = await Brand.find({
        name: { $regex: search, $options: 'i' },
        isDeleted: false,
        isActive: true
      }).select('_id');

      const brandIds = matchingBrands.map(brand => brand._id);

      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : []),
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

    // Price range filter will be applied after fetching products since we need to calculate sale prices
    // Note: We'll filter by computed sale prices after the database query

    // Size filter (check variants for available sizes)
    if (sizes.length > 0) {
      filter['variants.size'] = { $in: sizes };
    }

    const sortMap = {
      'priceLow': { regularPrice: 1 },
      'priceHigh': { regularPrice: -1 },
      'nameAZ': { productName: 1 },
      'nameZA': { productName: -1 },
      'newest': { createdAt: -1 },
      'featured': { isFeatured: -1, createdAt: -1 },
      'popularity': { sold: -1 },
      'rating': { averageRating: -1 },
      // Keep backward compatibility
      'price-low': { regularPrice: 1 },
      'price-high': { regularPrice: -1 },
      'name-az': { productName: 1 },
      'name-za': { productName: -1 }
    };

    const sortQuery = sortMap[sort] || sortMap['newest'];

    const allProducts = await Product.find(filter)
      .populate({ 
        path: 'category', 
        match: { isActive: true }, 
        select: 'name categoryOffer'
      })
      .populate({
        path: 'brand',
        match: { isActive: true, isDeleted: false },
        select: 'name brandOffer'
      })
      .sort(sortQuery);

    // Filter out products with inactive categories or brands
    let filteredProducts = allProducts.filter(p => p.category !== null && p.brand !== null);

    // Apply price range filter using computed sale prices
    if (minPrice > 0 || maxPrice < 1e9) {
      filteredProducts = filteredProducts.filter(product => {
        if (!product.variants || product.variants.length === 0) {
          return product.regularPrice >= minPrice && product.regularPrice <= maxPrice;
        }

        // Check if any variant's final price falls within the range
        return product.variants.some(variant => {
          const finalPrice = product.calculateVariantFinalPrice(variant);
          return finalPrice >= minPrice && finalPrice <= maxPrice;
        });
      });
    }

    const totalProducts = filteredProducts.length;
    const products = filteredProducts.slice(skip, skip + limit);

    const productsWithRatings = await Promise.all(
      products.map(async (product) => {
        const reviews = await Review.find({ product: product._id, isHidden: false });
        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

        // Convert to plain object - finalPrice is now stored in database
        const productObj = product.toObject();

        // finalPrice is already stored in variants, just ensure backward compatibility
        if (productObj.variants && productObj.variants.length > 0) {
          // Ensure finalPrice exists for each variant (fallback for migration period)
          productObj.variants = productObj.variants.map(variant => ({
            ...variant,
            finalPrice: product.calculateVariantFinalPrice(variant)
          }));

          // Add average final price for easy access
          productObj.averageFinalPrice = product.getAverageFinalPrice();
          // Keep averageSalePrice for backward compatibility
          productObj.averageSalePrice = productObj.averageFinalPrice;
        } else {
          productObj.averageFinalPrice = productObj.regularPrice;
          productObj.averageSalePrice = productObj.regularPrice;
        }

        return { ...productObj, averageRating: avgRating, totalReviews };
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
      },
      totalProductCount: totalProducts
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
    const brandIds = await Product.distinct('brand', {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds }
    });
    const brands = await Brand.find({
      _id: { $in: brandIds },
      isDeleted: false,
      isActive: true
    }).sort({ name: 1 });
    
    const page = parseInt(req.query.page) || 1;
    const limit = 12;

    // Extract filter parameters from query
    const selectedCategory = req.query.category || '';
    const search = req.query.q || req.query.search || '';
    const sortBy = req.query.sort || 'newest';
    const minPrice = req.query.minPrice || '';
    const maxPrice = req.query.maxPrice || '';

    // Build filter based on query parameters
    const filter = {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds }
    };

    // Apply search filter
    if (search) {
      // Find brands that match the search term (only active ones)
      const matchingBrands = await Brand.find({
        name: { $regex: search, $options: 'i' },
        isDeleted: false,
        isActive: true
      }).select('_id');

      const brandIds = matchingBrands.map(brand => brand._id);

      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : [])
      ];
    }

    // Apply category filter
    if (selectedCategory) {
      filter.category = selectedCategory;
    }

    // Price range filter will be applied after fetching products since we need to calculate sale prices
    // Note: We'll filter by computed sale prices after the database query
    const minPriceNum = minPrice ? parseFloat(minPrice) : 0;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : 1e9;

    // Build sort query (note: price sorting will use regularPrice since variants have multiple prices)
    const sortMap = {
      'priceLow': { regularPrice: 1 },
      'priceHigh': { regularPrice: -1 },
      'nameAZ': { productName: 1 },
      'nameZA': { productName: -1 },
      'newest': { createdAt: -1 },
      'featured': { isFeatured: -1, createdAt: -1 },
      'popularity': { sold: -1 },
      'rating': { averageRating: -1 }
    };
    const sortQuery = sortMap[sortBy] || sortMap['newest'];

    // Get all products first, then apply price filtering
    const allProducts = await Product.find(filter)
      .populate({ 
        path: 'category', 
        match: { isActive: true }, 
        select: 'name categoryOffer' 
      })
      .populate({ 
        path: 'brand', 
        match: { isActive: true, isDeleted: false }, 
        select: 'name brandOffer'
      })
      .sort(sortQuery);
      
    // Filter out products with inactive categories or brands
    let filteredProducts = allProducts.filter(p => p.category !== null && p.brand !== null);
    
    // Apply price range filter using computed sale prices
    if (minPriceNum > 0 || maxPriceNum < 1e9) {
      filteredProducts = filteredProducts.filter(product => {
        if (!product.variants || product.variants.length === 0) {
          return product.regularPrice >= minPriceNum && product.regularPrice <= maxPriceNum;
        }

        // Check if any variant's final price falls within the range
        return product.variants.some(variant => {
          const finalPrice = product.calculateVariantFinalPrice(variant);
          return finalPrice >= minPriceNum && finalPrice <= maxPriceNum;
        });
      });
    }

    const totalProductCount = filteredProducts.length;
    const totalPages = Math.ceil(totalProductCount / limit);
    const skip = (page - 1) * limit;
    const paginatedProducts = filteredProducts.slice(skip, skip + limit);

    // Calculate pagination variables
    const hasPrevPage = page > 1;
    const hasNextPage = page < totalPages;
    const prevPage = hasPrevPage ? page - 1 : null;
    const nextPage = hasNextPage ? page + 1 : null;

    // Generate page numbers array (show up to 5 pages around current page)
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // Check if this is an AJAX request for pagination
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      // For AJAX requests, render the page and return HTML
      return res.render('user/shop', {
        title: 'Shop Sneakers',
        layout: 'user/layouts/user-layout',
        active: 'shop',
        categories,
        brands,
        products: paginatedProducts,
        currentPage: page,
        totalPages,
        hasPrevPage,
        hasNextPage,
        prevPage,
        nextPage,
        pageNumbers,
        selectedCategory,
        search,
        sortBy,
        minPrice,
        maxPrice,
        totalProductCount
      });
    }

    // For regular requests, render normally
    res.render('user/shop', {
      title: 'Shop Sneakers',
      layout: 'user/layouts/user-layout',
      active: 'shop',
      categories,
      brands,
      products: paginatedProducts,
      currentPage: page,
      totalPages,
      hasPrevPage,
      hasNextPage,
      prevPage,
      nextPage,
      pageNumbers,
      selectedCategory,
      search,
      sortBy,
      minPrice,
      maxPrice,
      totalProductCount
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

    // Find brands that match the search term (only active ones)
    const matchingBrands = await Brand.find({
      name: { $regex: query, $options: 'i' },
      isDeleted: false,
      isActive: true
    }).select('_id');

    const brandIds = matchingBrands.map(brand => brand._id);

    // Filter to only include products from active categories
    const filter = {
      isDeleted: false,
      isListed: true,
      category: { $in: activeCategoryIds },
      $or: [
        { productName: { $regex: query, $options: 'i' } },
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : [])
      ]
    };

    // Get limited results for suggestions (8 products max)
    const suggestions = await Product.find(filter)
      .populate({
        path: 'category',
        match: { isActive: true, isDeleted: false },
        select: 'name categoryOffer'
      })
      .populate({
        path: 'brand',
        match: { isActive: true, isDeleted: false },
        select: 'name brandOffer'
      })
      .select('productName brand mainImage category slug regularPrice variants')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    // Only include products that have a category and brand, and add computed final prices
    const filteredSuggestions = suggestions
      .filter(p => p.category && p.category.name && p.brand && p.brand.name)
      .map(productData => {
        // Create a temporary Product instance to use model methods
        const tempProduct = new Product(productData);

        // finalPrice is now stored in database, ensure backward compatibility
        if (productData.variants && productData.variants.length > 0) {
          productData.variants = productData.variants.map(variant => ({
            ...variant,
            finalPrice: tempProduct.calculateVariantFinalPrice(variant)
          }));

          // Add average final price for easy access
          productData.averageFinalPrice = tempProduct.getAverageFinalPrice();
          // Keep averageSalePrice for backward compatibility
          productData.averageSalePrice = productData.averageFinalPrice;
        } else {
          productData.averageFinalPrice = productData.regularPrice;
          productData.averageSalePrice = productData.regularPrice;
        }

        return productData;
      });

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

    // Find product by slug and populate category with categoryOffer and brand with brandOffer
    const product = await Product.findOne({ slug: productSlug })
      .populate('category')
      .populate('brand');

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

    // Check if product's brand exists and is active
    if (!product.brand || product.brand.isDeleted || !product.brand.isActive) {
      return res.status(404).render('errors/404', {
        title: 'Product Not Available',
        message: 'This product is no longer available as its brand has been disabled.',
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
          select: 'name categoryOffer'
        })
        .populate({
          path: 'brand',
          match: { isActive: true, isDeleted: false },
          select: 'name brandOffer'
        })
        .sort({ createdAt: -1 })
        .limit(4);

      // Filter out products whose categories became null (inactive categories)
      relatedProductsRaw = relatedProductsRaw.filter(prod => prod.category !== null && prod.brand !== null);
    }

    // Add rating stats and computed sale prices to related products
    const relatedProducts = await Promise.all(
      relatedProductsRaw.map(async (relatedProduct) => {
        const relReviews = await Review.find({ product: relatedProduct._id, isHidden: false });
        const totalReviews = relReviews.length;
        const averageRating = totalReviews > 0
          ? relReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
          : 0;

        // Convert to plain object - finalPrice is now stored in database
        const productObj = relatedProduct.toObject();

        // finalPrice is already stored in variants, ensure backward compatibility
        if (productObj.variants && productObj.variants.length > 0) {
          productObj.variants = productObj.variants.map(variant => ({
            ...variant,
            finalPrice: relatedProduct.calculateVariantFinalPrice(variant)
          }));

          // Add average final price for easy access
          productObj.averageFinalPrice = relatedProduct.getAverageFinalPrice();
          // Keep averageSalePrice for backward compatibility
          productObj.averageSalePrice = productObj.averageFinalPrice;
        } else {
          productObj.averageFinalPrice = productObj.regularPrice;
          productObj.averageSalePrice = productObj.regularPrice;
        }

        return {
          ...productObj,
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

    // Calculate average final price for the template with error handling
    let averageFinalPrice;
    try {
      averageFinalPrice = product.getAverageFinalPrice();
    } catch (error) {
      console.error('Error calculating average final price:', error);
      // Fallback calculation with category and brand offer logic
      if (product.variants && product.variants.length > 0) {
        const totalPrice = product.variants.reduce((sum, variant) => {
          const basePrice = variant.basePrice || product.regularPrice;
          const categoryOffer = (product.category && product.category.categoryOffer) || 0;
          const brandOffer = (product.brand && product.brand.brandOffer) || 0;
          const productOffer = product.productOffer || 0;
          const variantOffer = variant.variantSpecificOffer || 0;
          const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
          return sum + (basePrice * (1 - maxOffer / 100));
        }, 0);
        averageFinalPrice = totalPrice / product.variants.length;
      } else {
        averageFinalPrice = product.regularPrice;
      }
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
      ratingBreakdown,
      averageFinalPrice
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