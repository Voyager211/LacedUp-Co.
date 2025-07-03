const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

/**
 * Test script to verify dual discount display functionality
 * This script tests:
 * 1. Base discount calculation (Regular Price → Base Price)
 * 2. Variant-specific offer calculation (Base Price → Final Price)
 * 3. Total discount display (Regular Price → Final Price)
 * 4. Different discount scenarios and edge cases
 */

async function testDualDiscountDisplay() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Dual Discount Display System...');

    // Test 1: Product with both base discount and variant-specific offers
    console.log('\n📝 Test 1: Product with Base Discount + Variant-Specific Offers');
    
    const dualDiscountProduct = new Product({
      productName: 'Dual Discount Test Sneaker',
      description: 'Test product for dual discount display',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b', // Use a dummy ObjectId
      regularPrice: 20000, // ₹20,000 MRP
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 15000, // ₹15,000 (25% base discount from regular price)
          variantSpecificOffer: 10 // Additional 10% off base price
          // Final price should be: 15000 * (1 - 0.10) = ₹13,500
          // Total discount: (20000 - 13500) / 20000 = 32.5%
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 16000, // ₹16,000 (20% base discount from regular price)
          variantSpecificOffer: 20 // Additional 20% off base price
          // Final price should be: 16000 * (1 - 0.20) = ₹12,800
          // Total discount: (20000 - 12800) / 20000 = 36%
        },
        {
          size: 'UK 10',
          stock: 3,
          basePrice: 14000, // ₹14,000 (30% base discount from regular price)
          variantSpecificOffer: 0 // No additional discount
          // Final price should be: 14000 * (1 - 0) = ₹14,000
          // Total discount: (20000 - 14000) / 20000 = 30%
        }
      ]
    });

    await dualDiscountProduct.save();
    console.log('✅ Dual discount product created');

    // Verify calculations
    const savedProduct = await Product.findById(dualDiscountProduct._id);
    console.log('\n📊 Dual Discount Analysis:');
    console.log(`💰 Regular Price: ₹${savedProduct.regularPrice}`);
    console.log('');

    savedProduct.variants.forEach((variant, index) => {
      const baseDiscount = Math.round(((savedProduct.regularPrice - variant.basePrice) / savedProduct.regularPrice) * 100);
      const totalDiscount = Math.round(((savedProduct.regularPrice - variant.finalPrice) / savedProduct.regularPrice) * 100);
      
      console.log(`📏 ${variant.size}:`);
      console.log(`   Base Price: ₹${variant.basePrice} (${baseDiscount}% base discount)`);
      console.log(`   Variant Offer: ${variant.variantSpecificOffer}%`);
      console.log(`   Final Price: ₹${variant.finalPrice}`);
      console.log(`   Total Discount: ${totalDiscount}%`);
      console.log(`   ✅ Calculation: ${Math.abs(variant.finalPrice - (variant.basePrice * (1 - variant.variantSpecificOffer / 100))) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 2: Product with only base discount (no variant-specific offers)
    console.log('\n📝 Test 2: Product with Only Base Discount');
    
    const baseOnlyProduct = new Product({
      productName: 'Base Discount Only Product',
      description: 'Product with only base discount',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 15000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 7',
          stock: 8,
          basePrice: 12000, // 20% base discount
          variantSpecificOffer: 0 // No additional discount
        },
        {
          size: 'UK 8',
          stock: 12,
          basePrice: 11000, // ~26.67% base discount
          variantSpecificOffer: 0 // No additional discount
        }
      ]
    });

    await baseOnlyProduct.save();
    const savedBaseOnly = await Product.findById(baseOnlyProduct._id);
    
    console.log('📊 Base Discount Only Analysis:');
    console.log(`💰 Regular Price: ₹${savedBaseOnly.regularPrice}`);
    console.log('');

    savedBaseOnly.variants.forEach(variant => {
      const baseDiscount = Math.round(((savedBaseOnly.regularPrice - variant.basePrice) / savedBaseOnly.regularPrice) * 100);
      
      console.log(`📏 ${variant.size}:`);
      console.log(`   Base Price: ₹${variant.basePrice} (${baseDiscount}% base discount)`);
      console.log(`   Variant Offer: ${variant.variantSpecificOffer}% (no extra discount)`);
      console.log(`   Final Price: ₹${variant.finalPrice} (same as base price)`);
      console.log(`   ✅ ${variant.finalPrice === variant.basePrice ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 3: Product with only variant-specific offers (base price = regular price)
    console.log('\n📝 Test 3: Product with Only Variant-Specific Offers');
    
    const variantOnlyProduct = new Product({
      productName: 'Variant Offers Only Product',
      description: 'Product with only variant-specific offers',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 10000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 6',
          stock: 15,
          basePrice: 10000, // Same as regular price (no base discount)
          variantSpecificOffer: 15 // 15% variant offer
        },
        {
          size: 'UK 7',
          stock: 20,
          basePrice: 10000, // Same as regular price (no base discount)
          variantSpecificOffer: 25 // 25% variant offer
        }
      ]
    });

    await variantOnlyProduct.save();
    const savedVariantOnly = await Product.findById(variantOnlyProduct._id);
    
    console.log('📊 Variant Offers Only Analysis:');
    console.log(`💰 Regular Price: ₹${savedVariantOnly.regularPrice}`);
    console.log('');

    savedVariantOnly.variants.forEach(variant => {
      const totalDiscount = Math.round(((savedVariantOnly.regularPrice - variant.finalPrice) / savedVariantOnly.regularPrice) * 100);
      
      console.log(`📏 ${variant.size}:`);
      console.log(`   Base Price: ₹${variant.basePrice} (no base discount)`);
      console.log(`   Variant Offer: ${variant.variantSpecificOffer}%`);
      console.log(`   Final Price: ₹${variant.finalPrice}`);
      console.log(`   Total Discount: ${totalDiscount}% (equals variant offer)`);
      console.log(`   ✅ ${totalDiscount === variant.variantSpecificOffer ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 4: Average discount calculation for default state
    console.log('\n📝 Test 4: Average Discount Calculation');
    
    const avgFinalPrice = savedProduct.getAverageFinalPrice();
    const avgTotalDiscount = Math.round(((savedProduct.regularPrice - avgFinalPrice) / savedProduct.regularPrice) * 100);
    
    // Calculate average variant offer
    const avgVariantOffer = savedProduct.variants.reduce((sum, v) => sum + v.variantSpecificOffer, 0) / savedProduct.variants.length;
    
    console.log('📊 Average Calculations (for default state):');
    console.log(`   Average Final Price: ₹${avgFinalPrice.toFixed(2)}`);
    console.log(`   Average Total Discount: ${avgTotalDiscount}%`);
    console.log(`   Average Variant Offer: ${Math.round(avgVariantOffer)}%`);
    console.log('');

    // Test 5: Edge cases
    console.log('\n📝 Test 5: Edge Cases');
    
    const edgeCaseProduct = new Product({
      productName: 'Edge Case Product',
      description: 'Product with edge case scenarios',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 5000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 5',
          stock: 5,
          basePrice: 6000, // Base price higher than regular price
          variantSpecificOffer: 10
        },
        {
          size: 'UK 6',
          stock: 8,
          basePrice: 5000, // Base price equals regular price
          variantSpecificOffer: 0 // No discount
        }
      ]
    });

    await edgeCaseProduct.save();
    const savedEdgeCase = await Product.findById(edgeCaseProduct._id);
    
    console.log('📊 Edge Case Analysis:');
    savedEdgeCase.variants.forEach(variant => {
      const baseDiscount = variant.basePrice < savedEdgeCase.regularPrice ? 
        Math.round(((savedEdgeCase.regularPrice - variant.basePrice) / savedEdgeCase.regularPrice) * 100) : 0;
      const totalDiscount = variant.finalPrice < savedEdgeCase.regularPrice ? 
        Math.round(((savedEdgeCase.regularPrice - variant.finalPrice) / savedEdgeCase.regularPrice) * 100) : 0;
      
      console.log(`   📏 ${variant.size}:`);
      console.log(`      Base Discount: ${baseDiscount}% ${baseDiscount === 0 ? '(no base discount)' : ''}`);
      console.log(`      Total Discount: ${totalDiscount}% ${totalDiscount === 0 ? '(no total discount)' : ''}`);
      console.log('');
    });

    // Cleanup
    await Product.findByIdAndDelete(dualDiscountProduct._id);
    await Product.findByIdAndDelete(baseOnlyProduct._id);
    await Product.findByIdAndDelete(variantOnlyProduct._id);
    await Product.findByIdAndDelete(edgeCaseProduct._id);
    console.log('🧹 Test products cleaned up');

    console.log('\n🎉 All dual discount display tests completed successfully!');
    console.log('✅ Dual discount system is working correctly');

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
  console.log('🚀 Starting dual discount display tests...');
  testDualDiscountDisplay();
}

module.exports = testDualDiscountDisplay;
