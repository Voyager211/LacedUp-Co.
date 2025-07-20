const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testPriceCalculationFlow() {
  try {
    console.log('🔍 Testing price calculation flow for Phantom product...');

    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📋 TESTING PRICE CALCULATION METHODS:');
    console.log('='.repeat(60));

    const uk7Variant = product.variants.find(v => v.size === 'UK 7');
    if (!uk7Variant) {
      console.log('❌ UK 7 variant not found');
      return;
    }

    console.log('\n🎯 UK 7 VARIANT ANALYSIS:');
    console.log('Base Price:', uk7Variant.basePrice);
    console.log('Stored Final Price:', uk7Variant.finalPrice);
    console.log('Variant Specific Offer:', uk7Variant.variantSpecificOffer);

    console.log('\n🔍 METHOD TESTING:');
    
    // Test 1: calculateVariantFinalPrice method
    console.log('\n1. calculateVariantFinalPrice(uk7Variant):');
    const calculatedPrice = product.calculateVariantFinalPrice(uk7Variant);
    console.log('   Result:', calculatedPrice);
    console.log('   Uses stored finalPrice?', calculatedPrice === uk7Variant.finalPrice);

    // Test 2: What would happen if finalPrice was undefined?
    console.log('\n2. Testing with finalPrice temporarily undefined:');
    const originalFinalPrice = uk7Variant.finalPrice;
    uk7Variant.finalPrice = undefined;
    const recalculatedPrice = product.calculateVariantFinalPrice(uk7Variant);
    console.log('   Result:', recalculatedPrice);
    console.log('   This should be the correct price (base price with current offers)');
    uk7Variant.finalPrice = originalFinalPrice; // Restore

    // Test 3: getVariantFinalPrice method
    console.log('\n3. getVariantFinalPrice("UK 7"):');
    const variantPrice = product.getVariantFinalPrice('UK 7');
    console.log('   Result:', variantPrice);

    // Test 4: getAverageFinalPrice method
    console.log('\n4. getAverageFinalPrice():');
    const avgPrice = product.getAverageFinalPrice();
    console.log('   Result:', avgPrice);

    console.log('\n🚨 ISSUE SUMMARY:');
    console.log('='.repeat(60));
    console.log('The calculateVariantFinalPrice method has this logic:');
    console.log('1. If variant.finalPrice !== undefined, return variant.finalPrice');
    console.log('2. Otherwise, calculate based on current offers');
    console.log('');
    console.log('PROBLEM: The stored finalPrice (13499.1) was calculated when');
    console.log('there was a 10% offer, but the method returns this old value');
    console.log('instead of recalculating with current offers (which are 0%).');
    console.log('');
    console.log('EXPECTED: ₹14999 (base price with no offers)');
    console.log('ACTUAL: ₹13499.1 (old stored value with 10% discount)');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testPriceCalculationFlow();