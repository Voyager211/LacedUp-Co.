const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkUnderArmourPrices() {
  try {
    console.log('🔍 Checking Under Armour product prices...');

    // Find Under Armour brand
    const underArmourBrand = await Brand.findOne({ name: 'Under Armour' });
    if (!underArmourBrand) {
      console.log('❌ Under Armour brand not found');
      return;
    }

    console.log(`🏷️ Under Armour Brand Offer: ${underArmourBrand.brandOffer}%`);

    // Find Under Armour products
    const products = await Product.find({ 
      brand: underArmourBrand._id,
      variants: { $exists: true, $ne: [] },
      isDeleted: false 
    }).populate('brand').populate('category');

    console.log(`\nFound ${products.length} Under Armour products:`);

    products.forEach(product => {
      console.log(`\n📦 ${product.productName}:`);
      console.log(`Regular Price: ₹${product.regularPrice}`);
      console.log(`Product Offer: ${product.productOffer}%`);
      console.log(`Brand Offer: ${product.brand.brandOffer}%`);
      
      product.variants.forEach((variant, index) => {
        const expectedPrice = variant.basePrice * (1 - product.brand.brandOffer / 100);
        console.log(`  Variant ${index + 1} (${variant.size}):`);
        console.log(`    Base Price: ₹${variant.basePrice}`);
        console.log(`    Final Price: ₹${variant.finalPrice}`);
        console.log(`    Expected Price: ₹${expectedPrice.toFixed(2)}`);
        console.log(`    Discount Applied: ₹${(variant.basePrice - variant.finalPrice).toFixed(2)}`);
        console.log(`    Correct: ${Math.abs(variant.finalPrice - expectedPrice) < 0.01 ? '✅' : '❌'}`);
      });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkUnderArmourPrices();