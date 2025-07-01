const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

async function testPricingSystem() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('✅ Connected to MongoDB');

    // Find a few products to test
    const products = await Product.find({}).limit(3);
    console.log(`\n📦 Testing pricing system with ${products.length} products\n`);

    for (const product of products) {
      console.log(`🔍 Testing: ${product.productName}`);
      console.log(`   Regular Price: ₹${product.regularPrice}`);
      
      if (product.variants && product.variants.length > 0) {
        console.log('   Variants:');
        
        for (const variant of product.variants) {
          const calculatedSalePrice = product.calculateVariantSalePrice(variant);
          const discount = variant.productOffer || 0;
          
          console.log(`     ${variant.size}: ${discount}% off = ₹${calculatedSalePrice.toFixed(2)} (Stock: ${variant.stock})`);
        }
        
        const avgSalePrice = product.getAverageSalePrice();
        console.log(`   Average Sale Price: ₹${avgSalePrice.toFixed(2)}`);
        
        // Test specific variant price
        const firstVariant = product.variants[0];
        const specificPrice = product.getVariantSalePrice(firstVariant.size);
        console.log(`   Specific Price (${firstVariant.size}): ₹${specificPrice.toFixed(2)}`);
        
        // Verify calculations
        const expectedPrice = product.regularPrice * (1 - (firstVariant.productOffer || 0) / 100);
        const isCorrect = Math.abs(specificPrice - expectedPrice) < 0.01;
        console.log(`   ✅ Calculation ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
        
      } else {
        console.log('   ❌ No variants found');
      }
      
      console.log(''); // Empty line for readability
    }

    // Test edge cases
    console.log('🧪 Testing Edge Cases:');
    
    // Test with 0% offer
    const testProduct = new Product({
      productName: 'Test Product',
      regularPrice: 1000,
      variants: [
        { size: 'UK 8', stock: 10, productOffer: 0 },
        { size: 'UK 9', stock: 5, productOffer: 25 },
        { size: 'UK 10', stock: 0, productOffer: 50 }
      ]
    });

    console.log('\n📋 Test Product (Regular: ₹1000):');
    testProduct.variants.forEach(variant => {
      const price = testProduct.calculateVariantSalePrice(variant);
      console.log(`   ${variant.size}: ${variant.productOffer}% off = ₹${price.toFixed(2)}`);
    });
    
    const avgPrice = testProduct.getAverageSalePrice();
    console.log(`   Average: ₹${avgPrice.toFixed(2)}`);
    
    // Expected: (1000 + 750 + 500) / 3 = 750
    const expectedAvg = (1000 + 750 + 500) / 3;
    const avgCorrect = Math.abs(avgPrice - expectedAvg) < 0.01;
    console.log(`   ✅ Average calculation ${avgCorrect ? 'CORRECT' : 'INCORRECT'} (Expected: ₹${expectedAvg.toFixed(2)})`);

    console.log('\n🎉 Pricing system test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testPricingSystem();
}

module.exports = { testPricingSystem };
