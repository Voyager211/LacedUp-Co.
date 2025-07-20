const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Category = require('../models/Category');

class PriceInvalidationService {
  
  /**
   * Invalidate cached prices for products when offers change
   */
  static async invalidateProductPrices(productIds) {
    try {
      console.log(`🗑️ Invalidating cached prices for ${productIds.length} products...`);
      
      // Remove cached finalPrice values to force recalculation
      await Product.updateMany(
        { _id: { $in: productIds } },
        { $unset: { 'variants.$[].finalPrice': '', 'variants.$[].finalPriceUpdatedAt': '' } }
      );
      
      console.log(`✅ Invalidated cached prices for ${productIds.length} products`);
    } catch (error) {
      console.error('❌ Error invalidating product prices:', error);
      throw error;
    }
  }

  /**
   * Invalidate prices when brand offer changes
   */
  static async invalidateBrandPrices(brandId) {
    try {
      const products = await Product.find({ 
        brand: brandId, 
        isDeleted: false 
      }).select('_id');
      
      const productIds = products.map(p => p._id);
      
      if (productIds.length > 0) {
        await this.invalidateProductPrices(productIds);
      }
      
      return productIds.length;
    } catch (error) {
      console.error('❌ Error invalidating brand prices:', error);
      throw error;
    }
  }

  /**
   * Invalidate prices when category offer changes
   */
  static async invalidateCategoryPrices(categoryId) {
    try {
      const products = await Product.find({ 
        category: categoryId, 
        isDeleted: false 
      }).select('_id');
      
      const productIds = products.map(p => p._id);
      
      if (productIds.length > 0) {
        await this.invalidateProductPrices(productIds);
      }
      
      return productIds.length;
    } catch (error) {
      console.error('❌ Error invalidating category prices:', error);
      throw error;
    }
  }

  /**
   * Recalculate and cache prices for specific products
   */
  static async recalculateProductPrices(productIds) {
    try {
      console.log(`🔄 Recalculating prices for ${productIds.length} products...`);
      
      const products = await Product.find({ 
        _id: { $in: productIds } 
      }).populate('brand').populate('category');
      
      for (const product of products) {
        // Set flag to cache prices during save
        product.set('_cachePrices', true);
        await product.save();
      }
      
      console.log(`✅ Recalculated prices for ${productIds.length} products`);
    } catch (error) {
      console.error('❌ Error recalculating product prices:', error);
      throw error;
    }
  }

  /**
   * Full price refresh for all products (use sparingly)
   */
  static async refreshAllPrices() {
    try {
      console.log('🔄 Starting full price refresh...');
      
      const products = await Product.find({ 
        isDeleted: false,
        variants: { $exists: true, $ne: [] }
      }).select('_id');
      
      const productIds = products.map(p => p._id);
      
      // Process in batches to avoid memory issues
      const batchSize = 50;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        await this.invalidateProductPrices(batch);
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(productIds.length/batchSize)}`);
      }
      
      console.log(`✅ Refreshed prices for ${productIds.length} products`);
      return productIds.length;
    } catch (error) {
      console.error('❌ Error refreshing all prices:', error);
      throw error;
    }
  }
}

module.exports = PriceInvalidationService;