const Product = require('../models/Product');

const ensureVisible = async (req, res, next) => {
  try {
    const productSlug = req.params.slug;

    const product = await Product.findOne({ slug: productSlug }).select('isBlocked isDeleted');

    if (!product || product.isDeleted || product.isBlocked) {
      return res.redirect('/shop');
    }

    next();
  } catch (err) {
    console.error('❌ Error in ensureVisible middleware:', err);
    return res.redirect('/shop');
  }
};

module.exports = ensureVisible;
