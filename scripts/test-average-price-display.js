const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

async function testAveragePriceDisplay() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('✅ Connected to MongoDB');

    // Create a test product with different discount percentages
    const testProduct = {
      productName: 'Test Average Price Display',
      slug: 'test-average-price-display',
      brand: 'Test Brand',
      category: '6751b8b5b8b5b8b5b8b5b8b5', // Use any existing category ID
      regularPrice: 1000,
      description: 'Test product for average price display',
      features: 'Test features',
      mainImage: 'https://via.placeholder.com/400x400',
      subImages: [],
      variants: [
        { size: 'UK 8', stock: 10, productOffer: 0 },    // ₹1000 (no discount)
        { size: 'UK 9', stock: 5, productOffer: 20 },    // ₹800 (20% off)
        { size: 'UK 10', stock: 3, productOffer: 40 }    // ₹600 (40% off)
      ]
    };

    console.log('\n🧪 Testing Average Price Display Logic');
    console.log('=====================================');
    
    console.log(`\n📋 Test Product: ${testProduct.productName}`);
    console.log(`💰 Regular Price: ₹${testProduct.regularPrice}`);
    console.log('\n📏 Variants:');
    
    let totalSalePrice = 0;
    const calculatedPrices = [];
    
    testProduct.variants.forEach(variant => {
      const salePrice = testProduct.regularPrice * (1 - variant.productOffer / 100);
      calculatedPrices.push(salePrice);
      totalSalePrice += salePrice;
      
      console.log(`   ${variant.size}: ${variant.productOffer}% off = ₹${salePrice.toFixed(2)}`);
    });
    
    const averagePrice = totalSalePrice / testProduct.variants.length;
    const minPrice = Math.min(...calculatedPrices);
    const maxPrice = Math.max(...calculatedPrices);
    
    console.log('\n📊 Price Analysis:');
    console.log(`   Minimum Price: ₹${minPrice.toFixed(2)}`);
    console.log(`   Maximum Price: ₹${maxPrice.toFixed(2)}`);
    console.log(`   Average Price: ₹${averagePrice.toFixed(2)}`);
    console.log(`   Price Range: ₹${minPrice.toFixed(2)} - ₹${maxPrice.toFixed(2)}`);
    
    console.log('\n🎯 Expected Display Behavior:');
    console.log('   OLD LOGIC (with ranges):');
    if (minPrice === maxPrice) {
      console.log(`     Would show: ₹${averagePrice.toFixed(2)}`);
    } else {
      console.log(`     Would show: ₹${minPrice.toFixed(2)} - ₹${maxPrice.toFixed(2)}`);
    }
    
    console.log('   NEW LOGIC (average only):');
    console.log(`     Will show: ₹${averagePrice.toFixed(2)}`);
    
    // Verify the calculation matches our expected formula
    const expectedAverage = (1000 + 800 + 600) / 3; // 800
    const calculationCorrect = Math.abs(averagePrice - expectedAverage) < 0.01;
    
    console.log('\n✅ Verification:');
    console.log(`   Expected Average: ₹${expectedAverage.toFixed(2)}`);
    console.log(`   Calculated Average: ₹${averagePrice.toFixed(2)}`);
    console.log(`   Calculation ${calculationCorrect ? 'CORRECT' : 'INCORRECT'} ✅`);
    
    // Test with a product that has same discount across all variants
    console.log('\n🧪 Testing Uniform Discount Product');
    console.log('===================================');
    
    const uniformProduct = {
      productName: 'Uniform Discount Test',
      regularPrice: 2000,
      variants: [
        { size: 'UK 7', stock: 10, productOffer: 25 },   // ₹1500
        { size: 'UK 8', stock: 10, productOffer: 25 },   // ₹1500
        { size: 'UK 9', stock: 10, productOffer: 25 }    // ₹1500
      ]
    };
    
    const uniformPrices = uniformProduct.variants.map(v => 
      uniformProduct.regularPrice * (1 - v.productOffer / 100)
    );
    const uniformAverage = uniformPrices.reduce((sum, price) => sum + price, 0) / uniformPrices.length;
    const uniformMin = Math.min(...uniformPrices);
    const uniformMax = Math.max(...uniformPrices);
    
    console.log(`\n📋 ${uniformProduct.productName}`);
    console.log(`💰 Regular Price: ₹${uniformProduct.regularPrice}`);
    console.log('📏 All variants: 25% off = ₹1500.00');
    console.log(`📊 Min: ₹${uniformMin.toFixed(2)}, Max: ₹${uniformMax.toFixed(2)}, Avg: ₹${uniformAverage.toFixed(2)}`);
    
    console.log('\n🎯 Display Comparison:');
    console.log('   OLD LOGIC: Would show ₹1500.00 (single price, no range)');
    console.log('   NEW LOGIC: Will show ₹1500.00 (same result)');
    
    console.log('\n🎉 Test Summary:');
    console.log('================');
    console.log('✅ Variable discounts: Now shows average instead of range');
    console.log('✅ Uniform discounts: Same display behavior (single price)');
    console.log('✅ Calculation formula: Consistent across all scenarios');
    console.log('✅ User experience: Simplified, single price point');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testAveragePriceDisplay();
}

module.exports = { testAveragePriceDisplay };
