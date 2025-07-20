const mongoose = require('mongoose');
const Product = require('./models/Product');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function removeFinalPriceFromDatabase() {
  try {
    console.log('🗑️  Removing finalPrice field from database...');

    // Use the Product model to update documents
    const result = await Product.updateMany(
      { 'variants.finalPrice': { $exists: true } },
      { $unset: { 'variants.$[].finalPrice': '' } }
    );

    console.log(`✅ Updated ${result.modifiedCount} products`);
    console.log('📊 Database cleanup summary:');
    console.log(`   - Products modified: ${result.modifiedCount}`);
    console.log(`   - finalPrice fields removed from all variants`);
    
    // Verify the cleanup
    const remainingCount = await Product.countDocuments({
      'variants.finalPrice': { $exists: true }
    });

    if (remainingCount === 0) {
      console.log('✅ Verification: No finalPrice fields remain in database');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} products still have finalPrice fields`);
    }

    console.log('\n🎉 Database cleanup completed!');
    console.log('💡 All price calculations are now 100% real-time');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

removeFinalPriceFromDatabase();