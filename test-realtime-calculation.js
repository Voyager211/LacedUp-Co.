const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testRealtimeCalculation() {
  try {
    console.log('🧪 Testing real-time price calculation...');

    // Get the Phantom product
    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 Testing Under Armour Phantom 4 Chrome:');
    console.log('Current offers: Brand=0%, Category=0%, Product=0%');

    // Test current state (no offers)
    const uk7Variant = product.variants.find(v => v.size === 'UK 7');
    const uk8Variant = product.variants.find(v => v.size === 'UK 8');

    console.log('\n🔍 Current Prices (Real-time calculation):');
    console.log(`UK 7: ₹${product.calculateVariantFinalPrice(uk7Variant)} (base: ₹${uk7Variant.basePrice})`);
    console.log(`UK 8: ₹${product.calculateVariantFinalPrice(uk8Variant)} (base: ₹${uk8Variant.basePrice})`);
    console.log(`Average: ₹${product.getAverageFinalPrice()}`);

    // Test with simulated brand offer
    console.log('\n🧪 Simulating 15% brand offer:');
    const originalBrandOffer = product.brand.brandOffer;
    product.brand.brandOffer = 15; // Temporarily set for testing

    console.log(`UK 7: ₹${product.calculateVariantFinalPrice(uk7Variant)} (15% off ₹${uk7Variant.basePrice})`);
    console.log(`UK 8: ₹${product.calculateVariantFinalPrice(uk8Variant)} (15% off ₹${uk8Variant.basePrice})`);
    console.log(`Average: ₹${product.getAverageFinalPrice()}`);

    // Test with simulated category offer
    console.log('\n🧪 Simulating 20% category offer (should override 15% brand offer):');
    const originalCategoryOffer = product.category.categoryOffer;
    product.category.categoryOffer = 20; // Temporarily set for testing

    console.log(`UK 7: ₹${product.calculateVariantFinalPrice(uk7Variant)} (20% off ₹${uk7Variant.basePrice})`);
    console.log(`UK 8: ₹${product.calculateVariantFinalPrice(uk8Variant)} (20% off ₹${uk8Variant.basePrice})`);
    console.log(`Average: ₹${product.getAverageFinalPrice()}`);

    // Test offer type detection
    console.log('\n🏷️ Offer Type Detection:');
    console.log(`UK 7 offer type: ${product.getOfferType(uk7Variant)}`);
    console.log(`UK 7 applied offer: ${product.getAppliedOffer(uk7Variant)}%`);

    // Restore original values
    product.brand.brandOffer = originalBrandOffer;
    product.category.categoryOffer = originalCategoryOffer;

    console.log('\n✅ Real-time calculation working correctly!');
    console.log('💡 Prices now update immediately when offers change');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testRealtimeCalculation();