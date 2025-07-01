const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

async function migrateTotalStock() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('✅ Connected to MongoDB');

    // Find all products
    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products to migrate`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      // Calculate totalStock from variants
      let calculatedTotalStock = 0;
      if (product.variants && product.variants.length > 0) {
        calculatedTotalStock = product.variants.reduce((total, variant) => {
          return total + (variant.stock || 0);
        }, 0);
      }

      // Check if totalStock needs updating
      if (product.totalStock !== calculatedTotalStock) {
        console.log(`🔄 Updating ${product.productName}: ${product.totalStock} → ${calculatedTotalStock}`);
        
        // Update totalStock directly without triggering pre-save hook
        await Product.findByIdAndUpdate(product._id, { 
          totalStock: calculatedTotalStock 
        });
        updatedCount++;
      } else {
        console.log(`✅ ${product.productName}: totalStock already correct (${product.totalStock})`);
        skippedCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Updated: ${updatedCount} products`);
    console.log(`⏭️  Skipped: ${skippedCount} products (already correct)`);
    console.log(`📦 Total: ${products.length} products processed`);

    // Verify the migration
    console.log('\n🔍 Verification:');
    const verificationProducts = await Product.find({}).limit(5);
    for (const product of verificationProducts) {
      const expectedTotal = product.variants.reduce((total, variant) => total + (variant.stock || 0), 0);
      const status = product.totalStock === expectedTotal ? '✅' : '❌';
      console.log(`${status} ${product.productName}: totalStock=${product.totalStock}, expected=${expectedTotal}`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  migrateTotalStock();
}

module.exports = { migrateTotalStock };
