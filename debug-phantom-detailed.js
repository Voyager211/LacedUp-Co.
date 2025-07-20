const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugPhantomDetailed() {
  try {
    console.log('🔍 Getting detailed analysis of Under Armour Phantom 4 Chrome...');

    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 DETAILED PRODUCT ANALYSIS:');
    console.log('='.repeat(50));
    console.log('Product Name:', product.productName);
    console.log('Product ID:', product._id);
    console.log('Regular Price:', product.regularPrice);
    console.log('Product Offer:', product.productOffer);
    console.log('Created At:', product.createdAt);
    console.log('Updated At:', product.updatedAt);

    console.log('\n🏷️ BRAND ANALYSIS:');
    console.log('Brand Name:', product.brand?.name);
    console.log('Brand ID:', product.brand?._id);
    console.log('Brand Offer:', product.brand?.brandOffer);
    console.log('Brand Active:', product.brand?.isActive);
    console.log('Brand Deleted:', product.brand?.isDeleted);

    console.log('\n📂 CATEGORY ANALYSIS:');
    console.log('Category Name:', product.category?.name);
    console.log('Category ID:', product.category?._id);
    console.log('Category Offer:', product.category?.categoryOffer);
    console.log('Category Active:', product.category?.isActive);
    console.log('Category Deleted:', product.category?.isDeleted);

    console.log('\n🔢 VARIANT ANALYSIS:');
    console.log('Total Variants:', product.variants?.length || 0);
    
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant, index) => {
        console.log(`\n--- Variant ${index + 1} (${variant.size}) ---`);
        console.log('Variant ID:', variant._id);
        console.log('Base Price:', variant.basePrice);
        console.log('Stock:', variant.stock);
        console.log('Variant Specific Offer:', variant.variantSpecificOffer);
        console.log('Stored Final Price:', variant.finalPrice);

        // Check what the calculation should be
        const categoryOffer = (product.category && product.category.categoryOffer) || 0;
        const brandOffer = (product.brand && product.brand.brandOffer) || 0;
        const productOffer = product.productOffer || 0;
        const variantOffer = variant.variantSpecificOffer || 0;
        const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
        const expectedFinalPrice = variant.basePrice * (1 - maxOffer / 100);

        console.log('Expected Final Price (calculated):', expectedFinalPrice);
        console.log('Difference:', variant.finalPrice - expectedFinalPrice);
        
        // Check if this looks like an old calculation with a different offer
        if (variant.finalPrice !== expectedFinalPrice && maxOffer === 0) {
          // Try to reverse engineer what offer was used
          const impliedDiscount = 1 - (variant.finalPrice / variant.basePrice);
          const impliedOfferPercentage = impliedDiscount * 100;
          console.log('🚨 MISMATCH DETECTED!');
          console.log('Implied offer percentage from stored price:', impliedOfferPercentage.toFixed(2) + '%');
          
          // Check if this matches common offer percentages
          if (Math.abs(impliedOfferPercentage - 10) < 0.1) {
            console.log('💡 This looks like a 10% offer was previously applied');
          } else if (Math.abs(impliedOfferPercentage - 15) < 0.1) {
            console.log('💡 This looks like a 15% offer was previously applied');
          } else if (Math.abs(impliedOfferPercentage - 20) < 0.1) {
            console.log('💡 This looks like a 20% offer was previously applied');
          } else {
            console.log('💡 This looks like a ' + impliedOfferPercentage.toFixed(2) + '% offer was previously applied');
          }
        }

        if (variant.size === 'UK 7' || variant.size === 'UK7') {
          console.log('🎯 THIS IS THE PROBLEMATIC UK7 VARIANT!');
          console.log('Expected: ₹' + expectedFinalPrice + ' (base price with no offers)');
          console.log('Actual: ₹' + variant.finalPrice + ' (stored in database)');
        }
      });
    }

    console.log('\n🧮 MODEL METHOD RESULTS:');
    console.log('getAverageFinalPrice():', product.getAverageFinalPrice());
    
    // Test what happens if we manually call the calculation method
    if (product.variants && product.variants.length > 0) {
      console.log('\nManual calculateVariantFinalPrice() calls:');
      product.variants.forEach((variant, index) => {
        const calculated = product.calculateVariantFinalPrice(variant);
        console.log(`Variant ${index + 1} (${variant.size}): ${calculated}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugPhantomDetailed();