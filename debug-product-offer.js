const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugProductOffer() {
  try {
    console.log('🔍 Debugging 30% product offer issue...');

    // Get the Phantom product
    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 CURRENT PRODUCT STATE:');
    console.log('='.repeat(50));
    console.log('Product Name:', product.productName);
    console.log('Product ID:', product._id);
    console.log('Product Offer:', product.productOffer + '%');
    console.log('Regular Price:', product.regularPrice);
    console.log('Updated At:', product.updatedAt);

    console.log('\n🏷️ OFFER ANALYSIS:');
    console.log('Brand Offer (Under Armour):', product.brand?.brandOffer + '%');
    console.log('Category Offer (Gym Sneakers):', product.category?.categoryOffer + '%');
    console.log('Product Offer:', product.productOffer + '%');

    console.log('\n🔢 VARIANT ANALYSIS:');
    const uk7Variant = product.variants.find(v => v.size === 'UK 7');
    const uk8Variant = product.variants.find(v => v.size === 'UK 8');

    if (uk7Variant) {
      console.log('\n--- UK 7 Variant ---');
      console.log('Base Price:', uk7Variant.basePrice);
      console.log('Variant Specific Offer:', uk7Variant.variantSpecificOffer + '%');
      console.log('Stored Final Price:', uk7Variant.finalPrice);

      // Manual calculation step by step
      console.log('\n🧮 MANUAL CALCULATION:');
      const categoryOffer = (product.category && product.category.categoryOffer) || 0;
      const brandOffer = (product.brand && product.brand.brandOffer) || 0;
      const productOffer = product.productOffer || 0;
      const variantOffer = uk7Variant.variantSpecificOffer || 0;

      console.log('  Category Offer:', categoryOffer + '%');
      console.log('  Brand Offer:', brandOffer + '%');
      console.log('  Product Offer:', productOffer + '%');
      console.log('  Variant Offer:', variantOffer + '%');

      const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
      console.log('  Max Offer:', maxOffer + '%');

      const calculatedPrice = uk7Variant.basePrice * (1 - maxOffer / 100);
      console.log('  Calculated Price:', calculatedPrice);
      console.log('  Expected with 30% off:', uk7Variant.basePrice * 0.7, '(₹' + (uk7Variant.basePrice * 0.7) + ')');

      // Test the model method
      console.log('\n🔍 MODEL METHOD TEST:');
      const modelCalculatedPrice = product.calculateVariantFinalPrice(uk7Variant);
      console.log('  calculateVariantFinalPrice():', modelCalculatedPrice);
      console.log('  getVariantFinalPrice("UK 7"):', product.getVariantFinalPrice('UK 7'));
      console.log('  getAverageFinalPrice():', product.getAverageFinalPrice());

      // Check if the issue is with data types
      console.log('\n🔍 DATA TYPE ANALYSIS:');
      console.log('  productOffer type:', typeof product.productOffer);
      console.log('  productOffer value:', product.productOffer);
      console.log('  productOffer === 30:', product.productOffer === 30);
      console.log('  productOffer == 30:', product.productOffer == 30);
    }

    // Check if the product was actually saved with the offer
    console.log('\n💾 DATABASE VERIFICATION:');
    const freshProduct = await Product.findById(product._id).select('productOffer updatedAt');
    console.log('Fresh from DB - Product Offer:', freshProduct.productOffer);
    console.log('Fresh from DB - Updated At:', freshProduct.updatedAt);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugProductOffer();