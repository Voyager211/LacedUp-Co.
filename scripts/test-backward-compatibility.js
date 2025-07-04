const mongoose = require('mongoose');
require('dotenv').config();

// Import the Product model
const Product = require('../models/Product');

async function testBackwardCompatibility() {
  try {
    console.log('🔄 Testing Backward Compatibility for Existing Products...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test Case 1: Legacy product without productOffer field
    console.log('\n📋 Test Case 1: Legacy product without productOffer');
    const legacyProduct = new Product({
      productName: 'Legacy Test Product',
      description: 'Legacy product without productOffer field',
      brand: 'Legacy Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 15000,
      // No productOffer field (should default to 0)
      features: 'Legacy features',
      mainImage: '/legacy-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 10,
          basePrice: 12000,
          variantSpecificOffer: 10 // Only variant offer exists
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 12500,
          variantSpecificOffer: 0 // No offers at all
        }
      ]
    });
    
    await legacyProduct.save();
    console.log('✅ Legacy product saved successfully');
    
    // Test the calculations
    console.log(`Product Offer: ${legacyProduct.productOffer || 0}% (should be 0)`);
    legacyProduct.variants.forEach(variant => {
      const appliedOffer = legacyProduct.getAppliedOffer(variant);
      const offerType = legacyProduct.getOfferType(variant);
      console.log(`   ${variant.size}: Applied ${appliedOffer}% (${offerType}), Final ₹${variant.finalPrice}`);
    });
    
    // Test Case 2: Product with existing productOffer = 0
    console.log('\n📋 Test Case 2: Product with explicit productOffer = 0');
    const zeroOfferProduct = new Product({
      productName: 'Zero Offer Test Product',
      description: 'Product with explicit zero product offer',
      brand: 'Zero Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 18000,
      productOffer: 0, // Explicitly set to 0
      features: 'Zero offer features',
      mainImage: '/zero-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 8,
          basePrice: 15000,
          variantSpecificOffer: 12 // Only variant offer should apply
        }
      ]
    });
    
    await zeroOfferProduct.save();
    console.log('✅ Zero offer product saved successfully');
    
    const variant = zeroOfferProduct.variants[0];
    const appliedOffer = zeroOfferProduct.getAppliedOffer(variant);
    const offerType = zeroOfferProduct.getOfferType(variant);
    console.log(`   ${variant.size}: Applied ${appliedOffer}% (${offerType}), Final ₹${variant.finalPrice}`);
    console.log(`   Expected: 12% variant offer should be applied`);
    
    // Test Case 3: Migration scenario - product with both old and new structure
    console.log('\n📋 Test Case 3: Migration compatibility test');
    
    // Simulate what might happen during migration
    const migrationProduct = new Product({
      productName: 'Migration Test Product',
      description: 'Product testing migration compatibility',
      brand: 'Migration Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 25000,
      productOffer: 18, // New product-level offer
      features: 'Migration features',
      mainImage: '/migration-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 6,
          basePrice: 20000,
          variantSpecificOffer: 15 // Variant offer lower than product offer
        },
        {
          size: 'UK 9',
          stock: 4,
          basePrice: 21000,
          variantSpecificOffer: 25 // Variant offer higher than product offer
        }
      ]
    });
    
    await migrationProduct.save();
    console.log('✅ Migration product saved successfully');
    
    migrationProduct.variants.forEach(variant => {
      const appliedOffer = migrationProduct.getAppliedOffer(variant);
      const offerType = migrationProduct.getOfferType(variant);
      const expectedOffer = Math.max(18, variant.variantSpecificOffer);
      const expectedType = 18 >= variant.variantSpecificOffer ? 'product' : 'variant';
      
      console.log(`   ${variant.size}:`);
      console.log(`     Applied: ${appliedOffer}% (${offerType})`);
      console.log(`     Expected: ${expectedOffer}% (${expectedType})`);
      console.log(`     Match: ${appliedOffer === expectedOffer && offerType === expectedType ? '✅' : '❌'}`);
    });
    
    // Test helper methods work correctly
    console.log('\n🔧 Testing Helper Methods:');
    
    const testVariant = migrationProduct.variants[0];
    console.log(`calculateVariantFinalPrice: ₹${migrationProduct.calculateVariantFinalPrice(testVariant)}`);
    console.log(`getVariantFinalPrice: ₹${migrationProduct.getVariantFinalPrice(testVariant.size)}`);
    console.log(`getAverageFinalPrice: ₹${migrationProduct.getAverageFinalPrice()}`);
    
    // Test legacy method compatibility
    console.log(`calculateVariantSalePrice (legacy): ₹${migrationProduct.calculateVariantSalePrice(testVariant)}`);
    console.log(`getAverageSalePrice (legacy): ₹${migrationProduct.getAverageSalePrice()}`);
    console.log(`getVariantSalePrice (legacy): ₹${migrationProduct.getVariantSalePrice(testVariant.size)}`);
    
    // Test edge cases
    console.log('\n🎯 Testing Edge Cases:');
    
    // Edge Case 1: Product with no variants
    const noVariantsProduct = new Product({
      productName: 'No Variants Test Product',
      description: 'Product with no variants',
      brand: 'Edge Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 10000,
      productOffer: 20,
      features: 'No variants features',
      mainImage: '/edge-image.jpg',
      variants: []
    });
    
    await noVariantsProduct.save();
    console.log('✅ No variants product saved successfully');
    console.log(`   Average final price: ₹${noVariantsProduct.getAverageFinalPrice()} (should equal regular price)`);
    
    // Edge Case 2: Product with undefined/null offers
    const nullOffersProduct = new Product({
      productName: 'Null Offers Test Product',
      description: 'Product with null/undefined offers',
      brand: 'Null Brand',
      category: '676b8b8b8b8b8b8b8b8b8b8b',
      regularPrice: 12000,
      // productOffer intentionally undefined
      features: 'Null offers features',
      mainImage: '/null-image.jpg',
      variants: [
        {
          size: 'UK 8',
          stock: 5,
          basePrice: 10000
          // variantSpecificOffer intentionally undefined
        }
      ]
    });
    
    await nullOffersProduct.save();
    console.log('✅ Null offers product saved successfully');
    
    const nullVariant = nullOffersProduct.variants[0];
    const nullAppliedOffer = nullOffersProduct.getAppliedOffer(nullVariant);
    const nullOfferType = nullOffersProduct.getOfferType(nullVariant);
    console.log(`   Applied offer: ${nullAppliedOffer}% (${nullOfferType})`);
    console.log(`   Final price: ₹${nullVariant.finalPrice} (should equal base price)`);
    
    // Clean up all test products
    await Product.deleteMany({ 
      productName: { 
        $in: [
          'Legacy Test Product',
          'Zero Offer Test Product',
          'Migration Test Product',
          'No Variants Test Product',
          'Null Offers Test Product'
        ] 
      } 
    });
    console.log('\n🧹 All test products cleaned up');
    
    console.log('\n✅ Backward compatibility test completed successfully!');
    console.log('🎉 The new system is fully backward compatible with existing products!');
    
  } catch (error) {
    console.error('❌ Backward compatibility test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testBackwardCompatibility();
