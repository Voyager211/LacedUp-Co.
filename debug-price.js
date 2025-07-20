const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugPriceCalculation() {
  try {
    console.log('🔍 Starting price calculation debug...');

    // Find a product with variants
    const product = await Product.findOne({ 
      variants: { $exists: true, $ne: [] },
      isDeleted: false 
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ No product with variants found');
      return;
    }

    console.log('\n📦 Product Details:');
    console.log('Name:', product.productName);
    console.log('Regular Price:', product.regularPrice);
    console.log('Product Offer:', product.productOffer);

    console.log('\n🏷️ Brand Details:');
    console.log('Brand Name:', product.brand?.name);
    console.log('Brand Offer:', product.brand?.brandOffer);
    console.log('Brand Object Type:', typeof product.brand);

    console.log('\n📂 Category Details:');
    console.log('Category Name:', product.category?.name);
    console.log('Category Offer:', product.category?.categoryOffer);
    console.log('Category Object Type:', typeof product.category);

    console.log('\n🔢 Variant Details:');
    product.variants.forEach((variant, index) => {
      console.log(`\nVariant ${index + 1} (${variant.size}):`);
      console.log('  Base Price:', variant.basePrice);
      console.log('  Variant Offer:', variant.variantSpecificOffer);
      console.log('  Stored Final Price:', variant.finalPrice);

      // Manual calculation
      const categoryOffer = (product.category && product.category.categoryOffer) || 0;
      const brandOffer = (product.brand && product.brand.brandOffer) || 0;
      const productOffer = product.productOffer || 0;
      const variantOffer = variant.variantSpecificOffer || 0;
      const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
      const calculatedFinalPrice = variant.basePrice * (1 - maxOffer / 100);

      console.log('  Manual Calculation:');
      console.log('    Category Offer:', categoryOffer);
      console.log('    Brand Offer:', brandOffer);
      console.log('    Product Offer:', productOffer);
      console.log('    Variant Offer:', variantOffer);
      console.log('    Max Offer:', maxOffer);
      console.log('    Calculated Final Price:', calculatedFinalPrice);
      console.log('    Matches Stored?', Math.abs(variant.finalPrice - calculatedFinalPrice) < 0.01);
    });

    // Test the model method
    console.log('\n🧮 Model Method Test:');
    const averageFinalPrice = product.getAverageFinalPrice();
    console.log('Average Final Price:', averageFinalPrice);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugPriceCalculation();