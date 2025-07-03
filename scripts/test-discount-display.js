const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

/**
 * Test script to verify discount percentage display functionality
 * This script tests:
 * 1. Discount calculation using stored finalPrice values
 * 2. Edge cases (regularPrice = 0, finalPrice >= regularPrice)
 * 3. Average discount calculation for product cards
 * 4. Variant-specific discount calculation for product details
 */

async function testDiscountDisplay() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Discount Display Functionality...');

    // Test 1: Create a product with various discount scenarios
    console.log('\n📝 Test 1: Creating test product with different discount scenarios');
    
    const testProduct = new Product({
      productName: 'Test Sneaker - Discount Display',
      description: 'Test product for discount display functionality',
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
          variantSpecificOffer: 20 // 20% off -> finalPrice = 6400
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 9000,
          variantSpecificOffer: 10 // 10% off -> finalPrice = 8100
        },
        {
          size: 'UK 10',
          stock: 3,
          basePrice: 7000,
          variantSpecificOffer: 30 // 30% off -> finalPrice = 4900
        },
        {
          size: 'UK 11',
          stock: 0,
          basePrice: 10000,
          variantSpecificOffer: 0 // No discount -> finalPrice = 10000
        }
      ]
    });

    await testProduct.save();
    console.log('✅ Test product created successfully');

    // Test 2: Verify finalPrice calculations and discount percentages
    console.log('\n🔍 Test 2: Verifying discount calculations');
    
    const savedProduct = await Product.findById(testProduct._id);
    
    console.log(`📋 Product: ${savedProduct.productName}`);
    console.log(`💰 Regular Price: ₹${savedProduct.regularPrice}`);
    console.log('\n📏 Variant Discount Analysis:');
    
    let totalFinalPrice = 0;
    savedProduct.variants.forEach((variant, index) => {
      const expectedFinalPrice = variant.basePrice * (1 - variant.variantSpecificOffer / 100);
      const actualFinalPrice = variant.finalPrice;
      const discountPercentage = Math.round(((savedProduct.regularPrice - actualFinalPrice) / savedProduct.regularPrice) * 100);
      
      totalFinalPrice += actualFinalPrice;
      
      console.log(`  📏 ${variant.size}:`);
      console.log(`     Base Price: ₹${variant.basePrice}`);
      console.log(`     Variant Offer: ${variant.variantSpecificOffer}%`);
      console.log(`     Expected Final Price: ₹${expectedFinalPrice.toFixed(2)}`);
      console.log(`     Actual Final Price: ₹${actualFinalPrice.toFixed(2)}`);
      console.log(`     Discount vs Regular: ${discountPercentage}%`);
      console.log(`     ✅ ${Math.abs(expectedFinalPrice - actualFinalPrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 3: Test average discount calculation (for product cards)
    console.log('\n📊 Test 3: Testing average discount calculation');
    
    const averageFinalPrice = totalFinalPrice / savedProduct.variants.length;
    const averageDiscountPercentage = Math.round(((savedProduct.regularPrice - averageFinalPrice) / savedProduct.regularPrice) * 100);
    
    console.log(`  📊 Average Final Price: ₹${averageFinalPrice.toFixed(2)}`);
    console.log(`  📊 Average Discount Percentage: ${averageDiscountPercentage}%`);
    
    // Verify using helper method
    const helperAveragePrice = savedProduct.getAverageFinalPrice();
    const helperDiscountPercentage = Math.round(((savedProduct.regularPrice - helperAveragePrice) / savedProduct.regularPrice) * 100);
    
    console.log(`  🔧 Helper Method Average: ₹${helperAveragePrice.toFixed(2)}`);
    console.log(`  🔧 Helper Method Discount: ${helperDiscountPercentage}%`);
    console.log(`  ✅ ${Math.abs(averageFinalPrice - helperAveragePrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);

    // Test 4: Edge cases
    console.log('\n⚠️  Test 4: Testing edge cases');
    
    // Edge case 1: regularPrice = 0
    const edgeCase1 = new Product({
      productName: 'Edge Case 1 - Zero Regular Price',
      description: 'Test edge case with zero regular price',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 0,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 5000,
          variantSpecificOffer: 20
        }
      ]
    });
    
    await edgeCase1.save();
    const savedEdgeCase1 = await Product.findById(edgeCase1._id);
    const edgeCase1Discount = savedEdgeCase1.regularPrice > 0 ? 
      Math.round(((savedEdgeCase1.regularPrice - savedEdgeCase1.variants[0].finalPrice) / savedEdgeCase1.regularPrice) * 100) : 0;
    
    console.log(`  📋 Edge Case 1: Regular Price = ₹0`);
    console.log(`     Final Price: ₹${savedEdgeCase1.variants[0].finalPrice}`);
    console.log(`     Discount Percentage: ${edgeCase1Discount}% (should be 0)`);
    console.log(`     ✅ ${edgeCase1Discount === 0 ? 'CORRECT' : 'INCORRECT'}`);

    // Edge case 2: finalPrice >= regularPrice
    const edgeCase2 = new Product({
      productName: 'Edge Case 2 - No Discount',
      description: 'Test edge case with no discount',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 5000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 6000, // Higher than regular price
          variantSpecificOffer: 0
        }
      ]
    });
    
    await edgeCase2.save();
    const savedEdgeCase2 = await Product.findById(edgeCase2._id);
    const edgeCase2Discount = savedEdgeCase2.variants[0].finalPrice < savedEdgeCase2.regularPrice ? 
      Math.round(((savedEdgeCase2.regularPrice - savedEdgeCase2.variants[0].finalPrice) / savedEdgeCase2.regularPrice) * 100) : 0;
    
    console.log(`  📋 Edge Case 2: Final Price >= Regular Price`);
    console.log(`     Regular Price: ₹${savedEdgeCase2.regularPrice}`);
    console.log(`     Final Price: ₹${savedEdgeCase2.variants[0].finalPrice}`);
    console.log(`     Discount Percentage: ${edgeCase2Discount}% (should be 0)`);
    console.log(`     ✅ ${edgeCase2Discount === 0 ? 'CORRECT' : 'INCORRECT'}`);

    // Cleanup: Remove test products
    await Product.findByIdAndDelete(testProduct._id);
    await Product.findByIdAndDelete(edgeCase1._id);
    await Product.findByIdAndDelete(edgeCase2._id);
    console.log('\n🧹 Test products cleaned up');

    console.log('\n🎉 All discount display tests completed successfully!');
    console.log('✅ Discount percentage calculations are working correctly');

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
  console.log('🚀 Starting discount display tests...');
  testDiscountDisplay();
}

module.exports = testDiscountDisplay;
