const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function updatePhantomPrices() {
  try {
    console.log('🔄 Updating Phantom product prices...');

    // Get the Phantom product
    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 Before Update:');
    console.log('Product Offer:', product.productOffer + '%');
    console.log('Brand Offer:', product.brand?.brandOffer + '%');
    
    product.variants.forEach((variant, index) => {
      console.log(`Variant ${index + 1} (${variant.size}):`);
      console.log('  Stored Final Price:', variant.finalPrice);
      console.log('  Real-time Calculated:', product.calculateVariantFinalPrice(variant));
    });

    // Force recalculation by saving the product
    console.log('\n🔄 Forcing price recalculation...');
    await product.save();

    // Reload the product to see updated prices
    const updatedProduct = await Product.findById(product._id).populate('brand').populate('category');

    console.log('\n📦 After Update:');
    updatedProduct.variants.forEach((variant, index) => {
      console.log(`Variant ${index + 1} (${variant.size}):`);
      console.log('  Stored Final Price:', variant.finalPrice);
      console.log('  Real-time Calculated:', updatedProduct.calculateVariantFinalPrice(variant));
    });

    console.log('\n✅ Phantom product prices updated successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

updatePhantomPrices();