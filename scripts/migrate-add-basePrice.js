require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('MongoDB connected for migration');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Migration function to add basePrice to existing variants
const migrateBasePrices = async () => {
  try {
    console.log('Starting basePrice migration...');
    
    // Find all products that have variants without basePrice
    const products = await Product.find({
      'variants.0': { $exists: true },
      $or: [
        { 'variants.basePrice': { $exists: false } },
        { 'variants.basePrice': null }
      ]
    });

    console.log(`Found ${products.length} products that need basePrice migration`);

    let updatedCount = 0;
    
    for (const product of products) {
      let hasUpdates = false;
      
      // Update each variant that's missing basePrice
      product.variants.forEach(variant => {
        if (!variant.basePrice) {
          // Use regularPrice as the base price for existing products
          variant.basePrice = product.regularPrice;
          hasUpdates = true;
          console.log(`  - Updated variant ${variant.size} for product "${product.productName}": basePrice = ${variant.basePrice}`);
        }
      });
      
      if (hasUpdates) {
        await product.save();
        updatedCount++;
        console.log(`✅ Updated product: ${product.productName}`);
      }
    }

    console.log(`\n🎉 Migration completed successfully!`);
    console.log(`📊 Updated ${updatedCount} products`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration
const runMigration = async () => {
  try {
    await connectDB();
    await migrateBasePrices();
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateBasePrices };
