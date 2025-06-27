const Product = require('../models/Product');

const ensureVisible = async (req, res, next) => {
  try {
    const productSlug = req.params.slug;

    // Find product and populate category to check both product and category status
    const product = await Product.findOne({ slug: productSlug })
      .populate('category')
      .select('isListed isDeleted category')
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

    next();
  } catch (err) {
    console.error('❌ Error in ensureVisible middleware:', err);
    return res.status(500).render('errors/server-error', {
      title: 'Server Error',
      message: 'Something went wrong while loading the product.',
      layout: 'user/layouts/user-layout',
      active: 'shop'
    });
  }
};

module.exports = ensureVisible;
