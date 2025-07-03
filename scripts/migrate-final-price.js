const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

/**
 * Migration script to populate finalPrice field for existing product variants
 * This script calculates and stores finalPrice = basePrice * (1 - variantSpecificOffer/100)
 * for all existing products in the database.
 */

async function migrateFinalPrice() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all products
    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products to migrate`);

    let updatedProducts = 0;
    let updatedVariants = 0;

    for (const product of products) {
      let productModified = false;

      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          // Only update if finalPrice is missing or undefined
          if (variant.finalPrice === undefined || variant.finalPrice === null) {
            // Calculate finalPrice using the same logic as the pre-save hook
            const basePrice = variant.basePrice || product.regularPrice;
            const offer = variant.variantSpecificOffer || variant.productOffer || 0;
            variant.finalPrice = basePrice * (1 - offer / 100);
            
            console.log(`  📏 Updated variant ${variant.size}: basePrice=₹${basePrice}, offer=${offer}%, finalPrice=₹${variant.finalPrice.toFixed(2)}`);
            updatedVariants++;
            productModified = true;
          } else {
            console.log(`  ✅ Variant ${variant.size} already has finalPrice: ₹${variant.finalPrice.toFixed(2)}`);
          }
        }
      }

      // Save the product if any variants were modified
      if (productModified) {
        await product.save();
        updatedProducts++;
        console.log(`✅ Updated product: ${product.productName}`);
      } else {
        console.log(`⏭️  Skipped product: ${product.productName} (no updates needed)`);
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Products processed: ${products.length}`);
    console.log(`   - Products updated: ${updatedProducts}`);
    console.log(`   - Variants updated: ${updatedVariants}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  console.log('🚀 Starting finalPrice migration...');
  migrateFinalPrice();
}

module.exports = migrateFinalPrice;
