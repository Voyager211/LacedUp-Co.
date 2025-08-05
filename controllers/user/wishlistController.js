const Wishlist = require('../../models/Wishlist');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');

// Get wishlist page
const getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const search = req.query.q || '';

    // Find user's wishlist and populate products with all necessary data
    let wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        populate: [
          { path: 'category', select: 'name categoryOffer' },
          { path: 'brand', select: 'name brandOffer' }
        ]
      });

    let products = [];
    
    if (wishlist && wishlist.products.length > 0) {
      // Filter out any null products (in case product was deleted)
      products = wishlist.products
        .filter(item => item.productId)
        .map(item => {
          const product = item.productId;
          
          // Calculate average final price for variants
          if (product.variants && product.variants.length > 0) {
            const finalPrices = product.variants.map(variant => {
              const basePrice = variant.basePrice || product.regularPrice;
              const categoryOffer = (product.category && product.category.categoryOffer) || 0;
              const brandOffer = (product.brand && product.brand.brandOffer) || 0;
              const productOffer = product.productOffer || 0;
              const variantOffer = variant.variantSpecificOffer || 0;
              const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
              return basePrice * (1 - maxOffer / 100);
            });
            product.averageFinalPrice = finalPrices.reduce((sum, price) => sum + price, 0) / finalPrices.length;
          }

          // Calculate total stock
          product.totalStock = product.variants ? 
            product.variants.reduce((total, variant) => total + variant.stock, 0) : 0;

          return product;
        });

      // Apply search filter if provided
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        products = products.filter(product => 
          searchRegex.test(product.productName) ||
          searchRegex.test(product.brand?.name || '') ||
          searchRegex.test(product.category?.name || '')
        );
      }
    }

    // Get wishlist product IDs for the template
    const userWishlistProductIds = products.map(p => p._id.toString());

    res.render('user/wishlist', {
      title: 'My Wishlist',
      products,
      search,
      user: req.user,
      layout: 'user/layouts/user-layout',
      active: 'wishlist',
      isWishlistPage: true,
      userWishlistProductIds
    });

  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).render('errors/server-error', {
      title: 'Server Error',
      message: 'Unable to load wishlist'
    });
  }
};

// Add product to wishlist
const addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    // Check if product already in wishlist
    const existingProduct = wishlist.products.find(
      item => item.productId.toString() === productId
    );

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    // Add product to wishlist
    wishlist.products.push({ productId });
    await wishlist.save();

    res.json({
      success: true,
      message: 'Product added to wishlist',
      wishlistCount: wishlist.products.length
    });

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to add product to wishlist'
    });
  }
};

// Remove product from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Remove product from wishlist
    wishlist.products = wishlist.products.filter(
      item => item.productId.toString() !== productId
    );

    await wishlist.save();

    res.json({
      success: true,
      message: 'Product removed from wishlist',
      wishlistCount: wishlist.products.length
    });

  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to remove product from wishlist'
    });
  }
};

// Search wishlist products (AJAX endpoint)
const searchWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const search = req.query.q || '';

    // Find user's wishlist and populate products
    let wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        populate: [
          { path: 'category', select: 'name categoryOffer' },
          { path: 'brand', select: 'name brandOffer' }
        ]
      });

    let products = [];
    
    if (wishlist && wishlist.products.length > 0) {
      products = wishlist.products
        .filter(item => item.productId)
        .map(item => {
          const product = item.productId;
          
          // Calculate average final price for variants
          if (product.variants && product.variants.length > 0) {
            const finalPrices = product.variants.map(variant => {
              const basePrice = variant.basePrice || product.regularPrice;
              const categoryOffer = (product.category && product.category.categoryOffer) || 0;
              const brandOffer = (product.brand && product.brand.brandOffer) || 0;
              const productOffer = product.productOffer || 0;
              const variantOffer = variant.variantSpecificOffer || 0;
              const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
              return basePrice * (1 - maxOffer / 100);
            });
            product.averageFinalPrice = finalPrices.reduce((sum, price) => sum + price, 0) / finalPrices.length;
          }

          // Calculate total stock
          product.totalStock = product.variants ? 
            product.variants.reduce((total, variant) => total + variant.stock, 0) : 0;

          return product;
        });

      // Apply search filter
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        products = products.filter(product => 
          searchRegex.test(product.productName) ||
          searchRegex.test(product.brand?.name || '') ||
          searchRegex.test(product.category?.name || '')
        );
      }
    }

    res.json({
      success: true,
      products,
      totalCount: products.length
    });

  } catch (error) {
    console.error('Error searching wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to search wishlist'
    });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  searchWishlist
};