const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Product = require('../models/Product');
const Category = require('../models/Category');

async function createValidationTestProduct() {
  try {
    console.log('🧪 Creating validation test product for frontend testing...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find or create a test category
    let testCategory = await Category.findOne({ name: 'Validation Test Category' });
    if (!testCategory) {
      testCategory = await Category.create({
        name: 'Validation Test Category',
        description: 'Category for validation testing',
        categoryOffer: 5, // 5% category offer
        isActive: true
      });
      console.log('✅ Test category created');
    } else {
      console.log('✅ Test category found');
    }
    
    // Delete existing test product if it exists
    await Product.deleteOne({ productName: 'Validation Test Product' });
    
    // Create test product for frontend validation testing
    const testProduct = new Product({
      productName: 'Validation Test Product',
      description: 'Product for testing base price validation in admin interface',
      brand: 'Validation Brand',
      category: testCategory._id,
      regularPrice: 25000, // ₹25,000 regular price
      productOffer: 10, // 10% product offer
      features: 'Validation testing features',
      mainImage: '/uploads/test-main.jpg',
      subImages: ['/uploads/test-sub1.jpg', '/uploads/test-sub2.jpg'],
      variants: [
        {
          size: 'UK 7',
          stock: 10,
          basePrice: 20000, // ₹20,000 < ₹25,000 ✅
          variantSpecificOffer: 5
        },
        {
          size: 'UK 8',
          stock: 8,
          basePrice: 22000, // ₹22,000 < ₹25,000 ✅
          variantSpecificOffer: 15
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
    
    console.log('\n🏷️ Variant Details:');
    testProduct.variants.forEach(variant => {
      console.log(`  ${variant.size}:`);
      console.log(`    Base Price: ₹${variant.basePrice} (${variant.basePrice < testProduct.regularPrice ? '✅ Valid' : '❌ Invalid'})`);
      console.log(`    Final Price: ₹${variant.finalPrice}`);
      console.log(`    Stock: ${variant.stock}`);
      console.log(`    Variant Offer: ${variant.variantSpecificOffer}%`);
    });
    
    console.log('\n🌐 Test URLs:');
    console.log(`   Add Product: http://localhost:3000/admin/add-product`);
    console.log(`   Edit Product: http://localhost:3000/admin/edit-product/${testProduct._id}`);
    console.log(`   Products List: http://localhost:3000/admin/products`);
    
    console.log('\n🧪 Frontend Validation Test Instructions:');
    console.log('1. Open the admin add product page');
    console.log('2. Set Regular Price to ₹20,000');
    console.log('3. Try to add a variant with Base Price ₹20,000 (equal - should show error)');
    console.log('4. Try to add a variant with Base Price ₹25,000 (higher - should show error)');
    console.log('5. Add a variant with Base Price ₹15,000 (lower - should be valid)');
    console.log('6. Change Regular Price to ₹10,000 and observe existing variants get validated');
    console.log('7. Try to submit the form with invalid base prices');
    
    console.log('\n🔍 Expected Validation Behavior:');
    console.log('✅ Real-time validation on base price input blur');
    console.log('✅ Error message: "Base price must be less than regular price (₹X)"');
    console.log('✅ Red error styling on invalid fields');
    console.log('✅ Preview shows "Invalid" for invalid base prices');
    console.log('✅ Form submission blocked when validation fails');
    console.log('✅ Re-validation when regular price changes');
    
    console.log('\n💡 Test Scenarios:');
    console.log('Scenario 1: Regular ₹20,000, Base ₹20,000 → ❌ Invalid (equal)');
    console.log('Scenario 2: Regular ₹20,000, Base ₹25,000 → ❌ Invalid (higher)');
    console.log('Scenario 3: Regular ₹20,000, Base ₹15,000 → ✅ Valid (lower)');
    console.log('Scenario 4: Regular ₹10,000, Base ₹15,000 → ❌ Invalid (higher)');
    console.log('Scenario 5: Regular ₹30,000, Base ₹25,000 → ✅ Valid (lower)');
    
  } catch (error) {
    console.error('❌ Failed to create validation test product:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
createValidationTestProduct();
