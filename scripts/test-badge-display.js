const mongoose = require('mongoose');
require('dotenv').config();

// Import the Product model
const Product = require('../models/Product');

async function testBadgeDisplay() {
  try {
    console.log('🏷️ Testing Badge Display Logic...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Create test product with offers
    console.log('\n📋 Creating test product with offers...');
    const testProduct = new Product({
      productName: 'Badge Display Test Product',
      description: 'Test product for badge display debugging',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 20000,
      productOffer: 15, // 15% product-level offer
      features: 'Badge test features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 16000,
          variantSpecificOffer: 10 // Product offer should win (15% > 10%)
        },
        {
          size: 'UK 9',
          stock: 8,
          basePrice: 16500,
          variantSpecificOffer: 20 // Variant offer should win (20% > 15%)
        }
      ]
    });
    
    await testProduct.save();
    console.log('✅ Test product created');
    
    // Simulate frontend data preparation
    console.log('\n🎨 Simulating Frontend Data Preparation:');
    
    testProduct.variants.forEach((variant, index) => {
      const productOffer = testProduct.productOffer || 0;
      const variantOffer = variant.variantSpecificOffer || 0;
      const appliedOffer = Math.max(productOffer, variantOffer);
      const offerType = productOffer >= variantOffer ? 'product' : 'variant';
      
      console.log(`\n   Variant ${variant.size}:`);
      console.log(`     Product Offer: ${productOffer}%`);
      console.log(`     Variant Offer: ${variantOffer}%`);
      console.log(`     Applied Offer: ${appliedOffer}%`);
      console.log(`     Offer Type: ${offerType}`);
      console.log(`     Final Price: ₹${variant.finalPrice}`);
      
      // Simulate badge logic
      if (appliedOffer > 0) {
        const offerLabel = offerType === 'product' ? 'Product' : 'Extra';
        const badgeText = `${offerLabel} ${appliedOffer}% off`;
        console.log(`     Badge Text: "${badgeText}"`);
        console.log(`     Badge Should Show: ✅ YES`);
      } else {
        console.log(`     Badge Should Show: ❌ NO (no offer)`);
      }
    });
    
    // Test the data attributes that would be passed to frontend
    console.log('\n📊 Frontend Data Attributes:');
    testProduct.variants.forEach((variant, index) => {
      const productOffer = testProduct.productOffer || 0;
      const variantOffer = variant.variantSpecificOffer || 0;
      const appliedOffer = Math.max(productOffer, variantOffer);
      const offerType = productOffer >= variantOffer ? 'product' : 'variant';
      
      console.log(`\n   Size Button for ${variant.size}:`);
      console.log(`     data-applied-offer="${appliedOffer}"`);
      console.log(`     data-offer-type="${offerType}"`);
      console.log(`     data-product-offer="${productOffer}"`);
      console.log(`     data-variant-offer="${variantOffer}"`);
      console.log(`     data-price="${variant.finalPrice}"`);
      console.log(`     data-base-price="${Math.round(variant.basePrice)}"`);
    });
    
    // Test default state calculations
    console.log('\n🔄 Default State (No Variant Selected):');
    const avgPrice = testProduct.getAverageFinalPrice();
    const avgBasePrice = testProduct.variants.reduce((sum, v) => sum + v.basePrice, 0) / testProduct.variants.length;
    const baseDiscount = testProduct.regularPrice > 0 && avgBasePrice < testProduct.regularPrice
      ? Math.round(((testProduct.regularPrice - avgBasePrice) / testProduct.regularPrice) * 100)
      : 0;
    
    console.log(`   Average Final Price: ₹${Math.round(avgPrice)}`);
    console.log(`   Average Base Price: ₹${Math.round(avgBasePrice)}`);
    console.log(`   Base Discount: ${baseDiscount}%`);
    console.log(`   Main Badge: "${baseDiscount}% OFF"`);
    console.log(`   Extra Badge: Hidden (default state)`);
    
    // Test edge cases
    console.log('\n🎯 Testing Edge Cases:');
    
    // Edge case: No offers
    const noOfferProduct = new Product({
      productName: 'No Offer Test Product',
      description: 'Product with no offers',
      brand: 'Test Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 15000,
      productOffer: 0,
      features: 'No offer features',
      mainImage: '/test-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 5,
          basePrice: 12000,
          variantSpecificOffer: 0
        }
      ]
    });
    
    await noOfferProduct.save();
    console.log('✅ No offer product created');
    
    const noOfferVariant = noOfferProduct.variants[0];
    const noOfferApplied = Math.max(noOfferProduct.productOffer || 0, noOfferVariant.variantSpecificOffer || 0);
    console.log(`   No Offer Case: Applied ${noOfferApplied}% (should be 0)`);
    console.log(`   Badge Should Show: ${noOfferApplied > 0 ? '✅ YES' : '❌ NO'}`);
    
    // Clean up
    await Product.deleteMany({ 
      productName: { 
        $in: ['Badge Display Test Product', 'No Offer Test Product'] 
      } 
    });
    console.log('\n🧹 Test products cleaned up');
    
    console.log('\n✅ Badge display test completed!');
    console.log('\n💡 Key Points for Frontend Implementation:');
    console.log('   1. Badge should show when appliedOffer > 0');
    console.log('   2. Badge text should be "Product X% off" or "Extra X% off"');
    console.log('   3. Badge should be hidden in default state');
    console.log('   4. Badge should appear when variant is selected with offer > 0');
    
  } catch (error) {
    console.error('❌ Badge display test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testBadgeDisplay();
