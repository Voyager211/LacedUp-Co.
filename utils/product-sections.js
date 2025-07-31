const Product = require('../models/Product');

async function getHomepageProducts() {
  const newArrivals = await Product.find({
    isDeleted: false,
    isListed: true,
    totalStock: { $gt: 0 } // Exclude out-of-stock products
  })
    .populate({
      path: 'category',
      match: { isActive: true }
    })
    .sort({ createdAt: -1 })
    .limit(4);

  const bestSellers = await Product.find({
    isDeleted: false,
    isListed: true,
    totalStock: { $gt: 0 } // Exclude out-of-stock products
  })
    .populate({
      path: 'category',
      match: { isActive: true }
    })
    .sort({ sold: -1 })
    .limit(4);

  // Filter out products with no category (inactive or missing)
  return {
    newArrivals: newArrivals.filter(p => p.category),
    bestSellers: bestSellers.filter(p => p.category)
  };
}

module.exports = { getHomepageProducts };