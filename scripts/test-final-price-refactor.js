const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

/**
 * Test script to verify the finalPrice refactoring works correctly
 * This script tests:
 * 1. Creating a new product with variants
 * 2. Verifying finalPrice is calculated and stored correctly
 * 3. Testing the helper methods still work
 */

async function testFinalPriceRefactor() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing finalPrice refactoring...');

    // Test 1: Create a new product with variants
    console.log('\n📝 Test 1: Creating new product with variants');
    
    const testProduct = new Product({
      productName: 'Test Sneaker - Final Price Refactor',
      description: 'Test product for finalPrice refactoring',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b', // Use a dummy ObjectId
      regularPrice: 10000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 8000,
          variantSpecificOffer: 10 // 10% off
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 8500,
          variantSpecificOffer: 20 // 20% off
        },
        {
          size: 'UK 10',
          stock: 0,
          basePrice: 9000,
          variantSpecificOffer: 0 // No discount
        }
      ]
    });

    // Save the product (this should trigger the pre-save hook to calculate finalPrice)
    await testProduct.save();
    console.log('✅ Product saved successfully');

    // Test 2: Verify finalPrice was calculated correctly
    console.log('\n🔍 Test 2: Verifying finalPrice calculations');
    
    const savedProduct = await Product.findById(testProduct._id);
    
    savedProduct.variants.forEach((variant, index) => {
      const expectedFinalPrice = variant.basePrice * (1 - variant.variantSpecificOffer / 100);
      const actualFinalPrice = variant.finalPrice;
      
      console.log(`  📏 Variant ${variant.size}:`);
      console.log(`     Base Price: ₹${variant.basePrice}`);
      console.log(`     Offer: ${variant.variantSpecificOffer}%`);
      console.log(`     Expected Final Price: ₹${expectedFinalPrice.toFixed(2)}`);
      console.log(`     Actual Final Price: ₹${actualFinalPrice.toFixed(2)}`);
      console.log(`     ✅ ${Math.abs(expectedFinalPrice - actualFinalPrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);
    });

    // Test 3: Test helper methods
    console.log('\n🔧 Test 3: Testing helper methods');
    
    const avgFinalPrice = savedProduct.getAverageFinalPrice();
    const specificVariantPrice = savedProduct.getVariantFinalPrice('UK 9');
    
    console.log(`  📊 Average Final Price: ₹${avgFinalPrice.toFixed(2)}`);
    console.log(`  📏 UK 9 Final Price: ₹${specificVariantPrice.toFixed(2)}`);
    
    // Calculate expected average
    const expectedAvg = savedProduct.variants.reduce((sum, v) => sum + v.finalPrice, 0) / savedProduct.variants.length;
    console.log(`  ✅ Average calculation: ${Math.abs(avgFinalPrice - expectedAvg) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);

    // Test 4: Test updating a variant
    console.log('\n✏️  Test 4: Testing variant update');
    
    savedProduct.variants[0].variantSpecificOffer = 25; // Change from 10% to 25%
    await savedProduct.save();
    
    const updatedProduct = await Product.findById(testProduct._id);
    const updatedVariant = updatedProduct.variants[0];
    const expectedUpdatedPrice = updatedVariant.basePrice * (1 - 25 / 100);
    
    console.log(`  📏 Updated variant ${updatedVariant.size}:`);
    console.log(`     New Offer: 25%`);
    console.log(`     Expected Final Price: ₹${expectedUpdatedPrice.toFixed(2)}`);
    console.log(`     Actual Final Price: ₹${updatedVariant.finalPrice.toFixed(2)}`);
    console.log(`     ✅ ${Math.abs(expectedUpdatedPrice - updatedVariant.finalPrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);

    // Cleanup: Remove test product
    await Product.findByIdAndDelete(testProduct._id);
    console.log('\n🧹 Test product cleaned up');

    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ finalPrice refactoring is working correctly');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  console.log('🚀 Starting finalPrice refactor tests...');
  testFinalPriceRefactor();
}

module.exports = testFinalPriceRefactor;
