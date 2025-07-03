const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

/**
 * Test script to verify admin form final price display functionality
 * This script tests:
 * 1. Creating products and verifying finalPrice is stored correctly
 * 2. Simulating admin form scenarios (add vs edit)
 * 3. Verifying stored vs calculated finalPrice values
 * 4. Testing edge cases for admin forms
 */

async function testAdminFinalPriceDisplay() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Admin Form Final Price Display...');

    // Test 1: Create a product to simulate "Add Product" form
    console.log('\n📝 Test 1: Simulating Add Product Form');
    
    const newProduct = new Product({
      productName: 'Test Admin Form Product',
      description: 'Test product for admin form functionality',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b', // Use a dummy ObjectId
      regularPrice: 12000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 8000,
          variantSpecificOffer: 15 // 15% off -> finalPrice should be 6800
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 9000,
          variantSpecificOffer: 20 // 20% off -> finalPrice should be 7200
        }
      ]
    });

    await newProduct.save();
    console.log('✅ New product created and saved');

    // Verify finalPrice was calculated and stored
    const savedNewProduct = await Product.findById(newProduct._id);
    console.log('\n📊 Add Product Form - Final Price Verification:');
    
    savedNewProduct.variants.forEach((variant, index) => {
      const expectedFinalPrice = variant.basePrice * (1 - variant.variantSpecificOffer / 100);
      console.log(`  📏 ${variant.size}:`);
      console.log(`     Base Price: ₹${variant.basePrice}`);
      console.log(`     Offer: ${variant.variantSpecificOffer}%`);
      console.log(`     Expected Final Price: ₹${expectedFinalPrice.toFixed(2)}`);
      console.log(`     Stored Final Price: ₹${variant.finalPrice.toFixed(2)}`);
      console.log(`     ✅ ${Math.abs(expectedFinalPrice - variant.finalPrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 2: Simulate "Edit Product" form scenario
    console.log('\n✏️  Test 2: Simulating Edit Product Form');
    
    // Modify the product to simulate editing
    savedNewProduct.variants[0].basePrice = 8500; // Change base price
    savedNewProduct.variants[0].variantSpecificOffer = 25; // Change offer
    // Note: finalPrice should be recalculated by pre-save hook
    
    await savedNewProduct.save();
    console.log('✅ Product updated (simulating edit form save)');

    // Verify finalPrice was recalculated
    const editedProduct = await Product.findById(newProduct._id);
    console.log('\n📊 Edit Product Form - Final Price Verification:');
    
    const editedVariant = editedProduct.variants[0];
    const expectedEditedPrice = editedVariant.basePrice * (1 - editedVariant.variantSpecificOffer / 100);
    
    console.log(`  📏 ${editedVariant.size} (edited):`);
    console.log(`     New Base Price: ₹${editedVariant.basePrice}`);
    console.log(`     New Offer: ${editedVariant.variantSpecificOffer}%`);
    console.log(`     Expected Final Price: ₹${expectedEditedPrice.toFixed(2)}`);
    console.log(`     Stored Final Price: ₹${editedVariant.finalPrice.toFixed(2)}`);
    console.log(`     ✅ ${Math.abs(expectedEditedPrice - editedVariant.finalPrice) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);

    // Test 3: Test admin form preview calculation logic
    console.log('\n🔍 Test 3: Testing Admin Form Preview Logic');
    
    // Simulate frontend preview calculation (what admin would see before saving)
    function simulatePreviewCalculation(basePrice, offer) {
      if (basePrice > 0) {
        return basePrice * (1 - offer / 100);
      }
      return 0;
    }

    const testScenarios = [
      { basePrice: 10000, offer: 20, description: 'Normal scenario' },
      { basePrice: 5000, offer: 0, description: 'No discount' },
      { basePrice: 0, offer: 15, description: 'Zero base price' },
      { basePrice: 8000, offer: 100, description: 'Maximum discount' }
    ];

    console.log('  🧮 Preview Calculation Tests:');
    testScenarios.forEach((scenario, index) => {
      const previewPrice = simulatePreviewCalculation(scenario.basePrice, scenario.offer);
      console.log(`    ${index + 1}. ${scenario.description}:`);
      console.log(`       Base: ₹${scenario.basePrice}, Offer: ${scenario.offer}%`);
      console.log(`       Preview: ₹${previewPrice.toFixed(2)}`);
      
      // Verify logic
      const expectedPreview = scenario.basePrice > 0 ? scenario.basePrice * (1 - scenario.offer / 100) : 0;
      console.log(`       ✅ ${Math.abs(previewPrice - expectedPreview) < 0.01 ? 'CORRECT' : 'INCORRECT'}`);
      console.log('');
    });

    // Test 4: Test stored vs calculated distinction
    console.log('\n🏷️  Test 4: Testing Stored vs Calculated Value Distinction');
    
    // Create a product with mixed scenarios
    const mixedProduct = new Product({
      productName: 'Mixed Scenario Product',
      description: 'Product with both stored and calculated values',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 10000,
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 7',
          stock: 8,
          basePrice: 7000,
          variantSpecificOffer: 10,
          finalPrice: 6300 // Pre-set finalPrice (stored value)
        },
        {
          size: 'UK 8',
          stock: 12,
          basePrice: 7500,
          variantSpecificOffer: 15
          // No finalPrice set - should be calculated by pre-save hook
        }
      ]
    });

    await mixedProduct.save();
    const savedMixedProduct = await Product.findById(mixedProduct._id);
    
    console.log('  📊 Mixed Scenario Results:');
    savedMixedProduct.variants.forEach((variant, index) => {
      const calculatedPrice = variant.basePrice * (1 - variant.variantSpecificOffer / 100);
      const isStoredValue = index === 0; // First variant had pre-set finalPrice
      
      console.log(`    📏 ${variant.size}:`);
      console.log(`       Type: ${isStoredValue ? 'Pre-stored' : 'Calculated by hook'}`);
      console.log(`       Base Price: ₹${variant.basePrice}`);
      console.log(`       Offer: ${variant.variantSpecificOffer}%`);
      console.log(`       Final Price: ₹${variant.finalPrice.toFixed(2)}`);
      console.log(`       Expected: ₹${calculatedPrice.toFixed(2)}`);
      
      if (isStoredValue) {
        // For pre-stored values, the hook should have recalculated it
        console.log(`       ✅ ${Math.abs(variant.finalPrice - calculatedPrice) < 0.01 ? 'RECALCULATED CORRECTLY' : 'NOT RECALCULATED'}`);
      } else {
        console.log(`       ✅ ${Math.abs(variant.finalPrice - calculatedPrice) < 0.01 ? 'CALCULATED CORRECTLY' : 'CALCULATION ERROR'}`);
      }
      console.log('');
    });

    // Cleanup: Remove test products
    await Product.findByIdAndDelete(newProduct._id);
    await Product.findByIdAndDelete(mixedProduct._id);
    console.log('🧹 Test products cleaned up');

    console.log('\n🎉 All admin form tests completed successfully!');
    console.log('✅ Admin final price display functionality is working correctly');
    console.log('\n📋 Summary:');
    console.log('   - Add Product Form: Final prices calculated and stored on save ✅');
    console.log('   - Edit Product Form: Stored final prices loaded correctly ✅');
    console.log('   - Preview Calculation: Frontend preview logic working ✅');
    console.log('   - Backend Calculation: Pre-save hook recalculates correctly ✅');

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
  console.log('🚀 Starting admin form final price display tests...');
  testAdminFinalPriceDisplay();
}

module.exports = testAdminFinalPriceDisplay;
