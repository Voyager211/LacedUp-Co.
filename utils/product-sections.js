const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

async function getHomepageProducts() {
  const newArrivals = await Product.find({
    isDeleted: false,
    isListed: true,
    totalStock: { $gt: 0 }
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
    totalStock: { $gt: 0 }
  })
    .populate({
      path: 'category',
      match: { isActive: true }
    })
    .sort({ sold: -1 })
    .limit(4);

  return {
    newArrivals: newArrivals.filter(p => p.category),
    bestSellers: bestSellers.filter(p => p.category)
  };
}

async function getActiveCategories() {
  return await Category.find({
    isActive: true,
    isDeleted: false
  })
    .sort({ name: 1 })
    .select('name slug image description');
}

// Add this new function
async function getActiveBrands() {
  return await Brand.find({
    isActive: true,
    isDeleted: false,
    image: { $exists: true, $ne: null } // Only brands with images
  })
    .sort({ name: 1 })
    .select('_id name slug image');
}

module.exports = { 
  getHomepageProducts,
  getActiveCategories,
  getActiveBrands
};
