const mongoose = require('mongoose');
require('dotenv').config();

// Import the Product model
const Product = require('../models/Product');

async function testProductLevelOffers() {
  try {
    console.log('🧪 Testing Product-Level Offer System...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test Case 1: Product offer higher than variant offer
    console.log('\n📋 Test Case 1: Product offer (20%) > Variant offer (10%)');
    const testProduct1 = new Product({
      productName: 'Test Product - Product Offer Higher',
      description: 'Test product for product-level offer system',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b', // Use a dummy ObjectId
      regularPrice: 10000,
      productOffer: 20, // 20% product-level offer
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 8000,
          variantSpecificOffer: 10 // 10% variant-specific offer
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 8500,
          variantSpecificOffer: 15 // 15% variant-specific offer
        }
      ]
    });
    
    await testProduct1.save();
    console.log('✅ Product saved successfully');
    
    // Test the calculations
    const variant1 = testProduct1.variants[0];
    const variant2 = testProduct1.variants[1];
    
    console.log(`   Variant 1 (UK 8): Base ₹${variant1.basePrice}, Final ₹${variant1.finalPrice}`);
    console.log(`   Expected: ₹${8000 * (1 - 0.20)} (20% product offer applied)`);
    console.log(`   Applied offer: ${testProduct1.getAppliedOffer(variant1)}%`);
    console.log(`   Offer type: ${testProduct1.getOfferType(variant1)}`);
    
    console.log(`   Variant 2 (UK 9): Base ₹${variant2.basePrice}, Final ₹${variant2.finalPrice}`);
    console.log(`   Expected: ₹${8500 * (1 - 0.20)} (20% product offer applied)`);
    console.log(`   Applied offer: ${testProduct1.getAppliedOffer(variant2)}%`);
    console.log(`   Offer type: ${testProduct1.getOfferType(variant2)}`);
    
    // Test Case 2: Variant offer higher than product offer
    console.log('\n📋 Test Case 2: Variant offer (25%) > Product offer (15%)');
    const testProduct2 = new Product({
      productName: 'Test Product - Variant Offer Higher',
      description: 'Test product for variant-level offer system',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 12000,
      productOffer: 15, // 15% product-level offer
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 9000,
          variantSpecificOffer: 25 // 25% variant-specific offer (higher)
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 9500,
          variantSpecificOffer: 10 // 10% variant-specific offer (lower)
        }
      ]
    });
    
    await testProduct2.save();
    console.log('✅ Product saved successfully');
    
    const variant3 = testProduct2.variants[0];
    const variant4 = testProduct2.variants[1];
    
    console.log(`   Variant 1 (UK 8): Base ₹${variant3.basePrice}, Final ₹${variant3.finalPrice}`);
    console.log(`   Expected: ₹${9000 * (1 - 0.25)} (25% variant offer applied)`);
    console.log(`   Applied offer: ${testProduct2.getAppliedOffer(variant3)}%`);
    console.log(`   Offer type: ${testProduct2.getOfferType(variant3)}`);
    
    console.log(`   Variant 2 (UK 9): Base ₹${variant4.basePrice}, Final ₹${variant4.finalPrice}`);
    console.log(`   Expected: ₹${9500 * (1 - 0.15)} (15% product offer applied)`);
    console.log(`   Applied offer: ${testProduct2.getAppliedOffer(variant4)}%`);
    console.log(`   Offer type: ${testProduct2.getOfferType(variant4)}`);
    
    // Test Case 3: Equal offers
    console.log('\n📋 Test Case 3: Equal offers (20% each)');
    const testProduct3 = new Product({
      productName: 'Test Product - Equal Offers',
      description: 'Test product for equal offer system',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 15000,
      productOffer: 20, // 20% product-level offer
      features: 'Test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 12000,
          variantSpecificOffer: 20 // 20% variant-specific offer (equal)
        }
      ]
    });
    
    await testProduct3.save();
    console.log('✅ Product saved successfully');
    
    const variant5 = testProduct3.variants[0];
    
    console.log(`   Variant 1 (UK 8): Base ₹${variant5.basePrice}, Final ₹${variant5.finalPrice}`);
    console.log(`   Expected: ₹${12000 * (1 - 0.20)} (20% offer applied)`);
    console.log(`   Applied offer: ${testProduct3.getAppliedOffer(variant5)}%`);
    console.log(`   Offer type: ${testProduct3.getOfferType(variant5)} (should be 'product' when equal)`);
    
    // Test average price calculation
    console.log('\n📋 Testing Average Price Calculations');
    console.log(`Product 1 average final price: ₹${testProduct1.getAverageFinalPrice()}`);
    console.log(`Product 2 average final price: ₹${testProduct2.getAverageFinalPrice()}`);
    console.log(`Product 3 average final price: ₹${testProduct3.getAverageFinalPrice()}`);
    
    // Clean up test products
    await Product.deleteMany({ 
      productName: { 
        $in: [
          'Test Product - Product Offer Higher',
          'Test Product - Variant Offer Higher', 
          'Test Product - Equal Offers'
        ] 
      } 
    });
    console.log('\n🧹 Test products cleaned up');
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testProductLevelOffers();
