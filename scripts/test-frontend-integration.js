const mongoose = require('mongoose');
require('dotenv').config();

// Import the Product model
const Product = require('../models/Product');

async function testFrontendIntegration() {
  try {
    console.log('🎨 Testing Frontend Integration for Product-Level Offers...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Create a comprehensive test product with mixed offer scenarios
    console.log('\n📋 Creating comprehensive test product...');
    const testProduct = new Product({
      productName: 'Frontend Integration Test Sneaker',
      description: 'Test product for frontend integration testing',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 20000, // ₹20,000 MRP
      productOffer: 15, // 15% product-level offer
      features: 'Test features for integration',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 7',
          stock: 8,
          basePrice: 16000, // ₹16,000 base price
          variantSpecificOffer: 10 // 10% variant offer (product offer wins: 15% > 10%)
        },
        {
          size: 'UK 8',
          stock: 12,
          basePrice: 16500, // ₹16,500 base price
          variantSpecificOffer: 20 // 20% variant offer (variant offer wins: 20% > 15%)
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 17000, // ₹17,000 base price
          variantSpecificOffer: 15 // 15% variant offer (equal to product offer, product wins)
        },
        {
          size: 'UK 10',
          stock: 3,
          basePrice: 17500, // ₹17,500 base price
          variantSpecificOffer: 0 // No variant offer (product offer wins: 15% > 0%)
        }
      ]
    });
    
    await testProduct.save();
    console.log('✅ Test product created successfully');
    
    // Test frontend data preparation
    console.log('\n📊 Testing Frontend Data Preparation:');
    
    // Simulate what the frontend templates would receive
    const frontendData = {
      product: testProduct.toObject(),
      averageFinalPrice: testProduct.getAverageFinalPrice()
    };
    
    console.log(`Regular Price: ₹${frontendData.product.regularPrice}`);
    console.log(`Product Offer: ${frontendData.product.productOffer}%`);
    console.log(`Average Final Price: ₹${Math.round(frontendData.averageFinalPrice)}`);
    
    // Test each variant's frontend display data
    console.log('\n🔍 Variant-by-Variant Frontend Data:');
    frontendData.product.variants.forEach((variant, index) => {
      const productOffer = frontendData.product.productOffer || 0;
      const variantOffer = variant.variantSpecificOffer || 0;
      const appliedOffer = Math.max(productOffer, variantOffer);
      const offerType = productOffer >= variantOffer ? 'product' : 'variant';
      
      console.log(`\n   ${variant.size}:`);
      console.log(`     Base Price: ₹${variant.basePrice}`);
      console.log(`     Final Price: ₹${variant.finalPrice}`);
      console.log(`     Product Offer: ${productOffer}%`);
      console.log(`     Variant Offer: ${variantOffer}%`);
      console.log(`     Applied Offer: ${appliedOffer}% (${offerType})`);
      
      // Calculate base discount (Regular → Base)
      const baseDiscount = frontendData.product.regularPrice > 0 && variant.basePrice < frontendData.product.regularPrice
        ? Math.round(((frontendData.product.regularPrice - variant.basePrice) / frontendData.product.regularPrice) * 100)
        : 0;
      
      console.log(`     Base Discount: ${baseDiscount}%`);
      console.log(`     Extra Badge: "${offerType === 'product' ? 'Product' : 'Extra'} ${appliedOffer}% off"`);
    });
    
    // Test average calculations for default state
    console.log('\n📈 Default State Calculations:');
    const avgBasePrice = frontendData.product.variants.reduce((sum, v) => sum + v.basePrice, 0) / frontendData.product.variants.length;
    const avgBaseDiscount = frontendData.product.regularPrice > 0 && avgBasePrice < frontendData.product.regularPrice
      ? Math.round(((frontendData.product.regularPrice - avgBasePrice) / frontendData.product.regularPrice) * 100)
      : 0;
    
    console.log(`Average Base Price: ₹${Math.round(avgBasePrice)}`);
    console.log(`Average Base Discount: ${avgBaseDiscount}%`);
    console.log(`Main Badge (Default): "${avgBaseDiscount}% OFF"`);
    console.log(`Extra Badge (Default): Hidden (no variant selected)`);
    
    // Test product card display
    console.log('\n🃏 Product Card Display Test:');
    const cardDiscountPercentage = frontendData.product.regularPrice > 0 && frontendData.averageFinalPrice < frontendData.product.regularPrice
      ? Math.round(((frontendData.product.regularPrice - frontendData.averageFinalPrice) / frontendData.product.regularPrice) * 100)
      : 0;
    
    console.log(`Card Price: ₹${Math.round(frontendData.averageFinalPrice)}`);
    console.log(`Card Discount: ${cardDiscountPercentage}%`);
    
    // Test shop page filtering compatibility
    console.log('\n🛍️ Shop Page Filtering Test:');
    const priceRanges = [
      { min: 10000, max: 15000 },
      { min: 13000, max: 16000 },
      { min: 15000, max: 20000 }
    ];
    
    priceRanges.forEach(range => {
      const matchesRange = frontendData.product.variants.some(variant => {
        const finalPrice = variant.finalPrice;
        return finalPrice >= range.min && finalPrice <= range.max;
      });
      console.log(`   Range ₹${range.min}-₹${range.max}: ${matchesRange ? '✅ Matches' : '❌ No match'}`);
    });
    
    // Verify calculations are correct
    console.log('\n✅ Verification:');
    let allCorrect = true;
    
    frontendData.product.variants.forEach((variant, index) => {
      const productOffer = frontendData.product.productOffer || 0;
      const variantOffer = variant.variantSpecificOffer || 0;
      const expectedOffer = Math.max(productOffer, variantOffer);
      const expectedFinalPrice = variant.basePrice * (1 - expectedOffer / 100);
      
      if (Math.abs(variant.finalPrice - expectedFinalPrice) > 0.01) {
        console.log(`❌ ${variant.size}: Expected ₹${expectedFinalPrice}, got ₹${variant.finalPrice}`);
        allCorrect = false;
      } else {
        console.log(`✅ ${variant.size}: Calculation correct`);
      }
    });
    
    if (allCorrect) {
      console.log('\n🎉 All calculations are correct!');
    } else {
      console.log('\n❌ Some calculations are incorrect!');
    }
    
    // Clean up
    await Product.deleteOne({ _id: testProduct._id });
    console.log('\n🧹 Test product cleaned up');
    
    console.log('\n✅ Frontend integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Frontend integration test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testFrontendIntegration();
