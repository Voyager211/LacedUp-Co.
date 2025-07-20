const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function debugPhantomProduct() {
  try {
    console.log('🔍 Searching for Under Armour Phantom 4 Chrome product...');

    // Search for the product by name pattern
    const products = await Product.find({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (products.length === 0) {
      console.log('❌ No Phantom 4 Chrome product found. Searching for Under Armour products...');
      
      // Find Under Armour brand first
      const underArmourBrand = await Brand.findOne({ name: /under armour/i });
      if (!underArmourBrand) {
        console.log('❌ Under Armour brand not found');
        return;
      }

      console.log(`✅ Found Under Armour brand: ${underArmourBrand.name} (Offer: ${underArmourBrand.brandOffer}%)`);

      // Find all Under Armour products
      const underArmourProducts = await Product.find({
        brand: underArmourBrand._id,
        isDeleted: false
      }).populate('brand').populate('category');

      console.log(`\n📦 Found ${underArmourProducts.length} Under Armour products:`);
      underArmourProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.productName}`);
      });

      // Look for products with "phantom" in the name
      const phantomProducts = underArmourProducts.filter(p => 
        p.productName.toLowerCase().includes('phantom')
      );

      if (phantomProducts.length > 0) {
        console.log(`\n👻 Found ${phantomProducts.length} Phantom products:`);
        phantomProducts.forEach((product, index) => {
          console.log(`${index + 1}. ${product.productName}`);
        });
        
        // Analyze the first phantom product
        const product = phantomProducts[0];
        console.log(`\n🔍 Analyzing: ${product.productName}`);
        await analyzeProduct(product);
      } else {
        console.log('\n❌ No Phantom products found in Under Armour products');
      }
    } else {
      console.log(`✅ Found ${products.length} Phantom 4 Chrome product(s):`);
      for (const product of products) {
        console.log(`\n🔍 Analyzing: ${product.productName}`);
        await analyzeProduct(product);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

async function analyzeProduct(product) {
  console.log('\n📦 Product Details:');
  console.log('Name:', product.productName);
  console.log('Regular Price:', product.regularPrice);
  console.log('Product Offer:', product.productOffer);

  console.log('\n🏷️ Brand Details:');
  console.log('Brand Name:', product.brand?.name);
  console.log('Brand Offer:', product.brand?.brandOffer);

  console.log('\n📂 Category Details:');
  console.log('Category Name:', product.category?.name);
  console.log('Category Offer:', product.category?.categoryOffer);

  console.log('\n🔢 Variant Details:');
  if (product.variants && product.variants.length > 0) {
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

      // Check if this is the UK7 variant showing 13499
      if (variant.size === 'UK 7' || variant.size === 'UK7') {
        console.log('  🎯 THIS IS THE UK7 VARIANT IN QUESTION!');
        if (variant.finalPrice === 13499) {
          console.log('  ⚠️  Final price matches the reported issue (13499)');
          console.log('  ⚠️  Expected final price should be:', variant.basePrice, '(base price with no offers)');
        }
      }
    });
  } else {
    console.log('No variants found for this product');
  }

  // Test the model method
  console.log('\n🧮 Model Method Test:');
  const averageFinalPrice = product.getAverageFinalPrice();
  console.log('Average Final Price:', averageFinalPrice);
}

debugPhantomProduct();