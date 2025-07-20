const mongoose = require('mongoose');
const Product = require('./models/Product');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function recalculatePrices() {
  try {
    console.log('🔍 Starting price recalculation for all products...');

    // Find all products with variants
    const products = await Product.find({ 
      variants: { $exists: true, $ne: [] },
      isDeleted: false 
    });

    console.log(`Found ${products.length} products to update`);

    let updatedCount = 0;

    for (const product of products) {
      console.log(`\n📦 Processing: ${product.productName}`);
      
      // Save the product to trigger the pre-save hook which recalculates finalPrice
      await product.save();
      updatedCount++;
      
      console.log(`✅ Updated ${product.productName}`);
    }

    console.log(`\n🎉 Successfully updated ${updatedCount} products`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

recalculatePrices();