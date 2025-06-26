const Product = require('../models/Product');

const ensureVisible = async (req, res, next) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId).select('isBlocked isDeleted');

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
