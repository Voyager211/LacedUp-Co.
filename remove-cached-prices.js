const mongoose = require('mongoose');
const Product = require('./models/Product');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function removeCachedPrices() {
  try {
    console.log('🗑️  Removing all cached finalPrice values...');

    // Remove finalPrice field from all variants to force real-time calculation
    const result = await Product.updateMany(
      { 'variants.finalPrice': { $exists: true } },
      { $unset: { 'variants.$[].finalPrice': '' } }
    );

    console.log(`✅ Updated ${result.modifiedCount} products`);
    console.log('💡 All prices will now be calculated in real-time');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

removeCachedPrices();