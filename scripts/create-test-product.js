const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Product = require('../models/Product');
const Category = require('../models/Category');

async function createTestProduct() {
  try {
    console.log('🛍️ Creating test product for badge testing...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find or create a test category with category offer
    let testCategory = await Category.findOne({ name: 'Test Category' });
    if (!testCategory) {
      testCategory = await Category.create({
        name: 'Test Category',
        description: 'Category for testing purposes with category offer',
        categoryOffer: 25, // 25% category offer
        isActive: true
      });
      console.log('✅ Test category created with 25% category offer');
    } else {
      // Update existing category to have an offer
      testCategory.categoryOffer = 25;
      await testCategory.save();
      console.log('✅ Test category updated with 25% category offer');
    }
    
    // Delete existing test product if it exists
    await Product.deleteOne({ productName: 'Badge Test Sneaker' });
    
    // Create test product with offers
    const testProduct = new Product({
      productName: 'Badge Test Sneaker',
      description: 'Test product for badge display debugging with offers',
      brand: 'Test Brand',
      category: testCategory._id,
      regularPrice: 25000, // ₹25,000 MRP
      productOffer: 20, // 20% product-level offer
      features: 'Lightweight, Comfortable, Durable, Breathable',
      mainImage: '/uploads/test-main.jpg',
      subImages: ['/uploads/test-sub1.jpg', '/uploads/test-sub2.jpg'],
      variants: [
        {
          size: 'UK 7',
          stock: 10,
          basePrice: 20000, // ₹20,000 base price
          variantSpecificOffer: 15 // 15% variant offer (category offer wins: 25% > 20% > 15%)
        },
        {
          size: 'UK 8',
          stock: 8,
          basePrice: 20500, // ₹20,500 base price
          variantSpecificOffer: 30 // 30% variant offer (variant offer wins: 30% > 25% > 20%)
        },
        {
          size: 'UK 9',
          stock: 5,
          basePrice: 21000, // ₹21,000 base price
          variantSpecificOffer: 20 // 20% variant offer (category offer wins: 25% > 20% > 20%)
        },
        {
          size: 'UK 10',
          stock: 3,
          basePrice: 21500, // ₹21,500 base price
          variantSpecificOffer: 0 // No variant offer (category offer wins: 25% > 20% > 0%)
        }
      ]
    });
    
    await testProduct.save();
    console.log('✅ Test product created successfully');
    
    // Display product details
    console.log('\n📊 Product Details:');
    console.log(`Product Name: ${testProduct.productName}`);
    console.log(`Slug: ${testProduct.slug}`);
    console.log(`Regular Price: ₹${testProduct.regularPrice}`);
    console.log(`Product Offer: ${testProduct.productOffer}%`);
    console.log(`Average Final Price: ₹${Math.round(testProduct.getAverageFinalPrice())}`);
    
    console.log('\n🏷️ Variant Details:');
    testProduct.variants.forEach(variant => {
      const appliedOffer = testProduct.getAppliedOffer(variant);
      const offerType = testProduct.getOfferType(variant);
      console.log(`  ${variant.size}: Base ₹${variant.basePrice}, Final ₹${variant.finalPrice}, Applied ${appliedOffer}% (${offerType})`);
    });

    console.log('\n🎯 Expected Badge Behavior:');
    console.log('  UK 7: "Category 25% off" (category wins)');
    console.log('  UK 8: "Extra 30% off" (variant wins)');
    console.log('  UK 9: "Category 25% off" (category wins)');
    console.log('  UK 10: "Category 25% off" (category wins)');
    
    console.log(`\n🌐 Test URL: http://localhost:3000/product/${testProduct.slug}`);
    console.log('\n💡 Instructions:');
    console.log('1. Open the URL above in your browser');
    console.log('2. Open browser developer tools (F12)');
    console.log('3. Go to Console tab');
    console.log('4. Click on different size variants');
    console.log('5. Look for badge debug messages in console');
    console.log('6. Check if the green "Extra X% off" badge appears');
    
  } catch (error) {
    console.error('❌ Failed to create test product:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestProduct();
