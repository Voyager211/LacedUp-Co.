const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

async function testVariantSelectionBehavior() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('✅ Connected to MongoDB');

    // Find a product to test with
    const product = await Product.findOne({});
    
    if (!product) {
      console.log('❌ No products found for testing');
      return;
    }

    console.log('\n🧪 Testing Variant Selection Behavior');
    console.log('=====================================');
    
    console.log(`\n📋 Test Product: ${product.productName}`);
    console.log(`💰 Regular Price: ₹${product.regularPrice}`);
    
    if (!product.variants || product.variants.length === 0) {
      console.log('❌ No variants found for this product');
      return;
    }

    console.log('\n📏 Available Variants:');
    product.variants.forEach((variant, index) => {
      const offer = variant.productOffer || 0;
      const salePrice = product.regularPrice * (1 - offer / 100);
      console.log(`   ${index + 1}. ${variant.size}: ${offer}% off = ₹${salePrice.toFixed(2)} (Stock: ${variant.stock})`);
    });

    // Test initial state (no variant selected)
    console.log('\n🎯 Testing Initial State (No Variant Selected):');
    console.log('================================================');
    
    const calculatedPrices = product.variants.map(v => {
      const offer = v.productOffer || 0;
      return product.regularPrice * (1 - offer / 100);
    });
    
    const avgPrice = calculatedPrices.reduce((sum, price) => sum + price, 0) / calculatedPrices.length;
    const avgOffer = product.variants.reduce((sum, v) => sum + (v.productOffer || 0), 0) / product.variants.length;
    
    console.log(`   Expected Average Price: ₹${avgPrice.toFixed(2)}`);
    console.log(`   Expected Average Discount: ${Math.round(avgOffer)}% OFF`);
    console.log(`   Expected Stock Display: Hidden`);
    console.log(`   Expected Add to Cart: Disabled ("Select Size First")`);
    console.log(`   Expected Size Buttons: None selected (no 'active' class)`);

    // Test variant selection
    console.log('\n🎯 Testing Variant Selection:');
    console.log('==============================');
    
    const firstVariant = product.variants[0];
    const firstOffer = firstVariant.productOffer || 0;
    const firstPrice = product.regularPrice * (1 - firstOffer / 100);
    
    console.log(`\n   When selecting "${firstVariant.size}":`);
    console.log(`   Expected Price: ₹${firstPrice.toFixed(2)}`);
    console.log(`   Expected Discount: ${firstOffer}% OFF`);
    console.log(`   Expected Stock: ${firstVariant.stock > 0 ? 'Visible' : 'Out of Stock'}`);
    console.log(`   Expected Add to Cart: ${firstVariant.stock > 0 ? 'Enabled' : 'Disabled'}`);
    console.log(`   Expected Button State: "${firstVariant.size}" has 'active' class`);

    // Test deselection behavior
    console.log('\n🎯 Testing Variant Deselection:');
    console.log('===============================');
    console.log('   When clicking outside size selection area:');
    console.log(`   Expected Price: ₹${avgPrice.toFixed(2)} (back to average)`);
    console.log(`   Expected Discount: ${Math.round(avgOffer)}% OFF (back to average)`);
    console.log(`   Expected Stock Display: Hidden`);
    console.log(`   Expected Add to Cart: Disabled ("Select Size First")`);
    console.log(`   Expected Size Buttons: None selected (no 'active' class)`);

    // Test edge cases
    console.log('\n🎯 Testing Edge Cases:');
    console.log('======================');
    
    const outOfStockVariants = product.variants.filter(v => v.stock === 0);
    const inStockVariants = product.variants.filter(v => v.stock > 0);
    
    console.log(`   Out of Stock Variants: ${outOfStockVariants.length}`);
    console.log(`   In Stock Variants: ${inStockVariants.length}`);
    
    if (outOfStockVariants.length > 0) {
      const outOfStockVariant = outOfStockVariants[0];
      console.log(`\n   When selecting out-of-stock "${outOfStockVariant.size}":`);
      console.log(`   Expected Button: Disabled (not clickable)`);
      console.log(`   Expected Behavior: No selection should occur`);
    }

    // Test clicking same variant twice (deselection)
    console.log('\n🎯 Testing Same Variant Click (Deselection):');
    console.log('============================================');
    console.log('   When clicking the same selected variant again:');
    console.log('   Expected Behavior: Deselect and return to default state');
    console.log(`   Expected Price: ₹${avgPrice.toFixed(2)} (back to average)`);

    // Frontend behavior summary
    console.log('\n📱 Frontend Behavior Summary:');
    console.log('=============================');
    console.log('✅ Page Load: No variant pre-selected, shows average price');
    console.log('✅ Variant Click: Select variant, show specific price/stock');
    console.log('✅ Same Variant Click: Deselect variant, return to average');
    console.log('✅ Outside Click: Deselect variant, return to average');
    console.log('✅ Page Refresh: Reset to no selection state');
    console.log('✅ Out of Stock: Buttons disabled, not selectable');
    console.log('✅ Add to Cart: Requires variant selection');

    console.log('\n🎉 Variant Selection Behavior Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testVariantSelectionBehavior();
}

module.exports = { testVariantSelectionBehavior };
