const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixStalePrices() {
  try {
    console.log('🔧 Starting stale price correction...');

    // Get all products with variants
    const products = await Product.find({
      isDeleted: false,
      variants: { $exists: true, $ne: [] }
    }).populate('brand').populate('category');

    console.log(`📦 Found ${products.length} products to check`);

    let updatedCount = 0;
    let totalVariantsUpdated = 0;

    for (const product of products) {
      let productNeedsUpdate = false;
      let variantsUpdated = 0;

      console.log(`\n🔍 Checking: ${product.productName}`);

      // Check each variant for stale prices
      for (const variant of product.variants) {
        // Calculate what the final price should be with current offers
        const categoryOffer = (product.category && product.category.categoryOffer) || 0;
        const brandOffer = (product.brand && product.brand.brandOffer) || 0;
        const productOffer = product.productOffer || 0;
        const variantOffer = variant.variantSpecificOffer || 0;
        const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);
        const correctFinalPrice = variant.basePrice * (1 - maxOffer / 100);

        // Check if stored price differs from calculated price
        const priceDifference = Math.abs(variant.finalPrice - correctFinalPrice);
        
        if (priceDifference > 0.01) { // Allow for small floating point differences
          console.log(`  ⚠️  ${variant.size}: Stored=${variant.finalPrice}, Correct=${correctFinalPrice}`);
          variant.finalPrice = correctFinalPrice;
          productNeedsUpdate = true;
          variantsUpdated++;
        }
      }

      if (productNeedsUpdate) {
        // Save the product to update the variant prices
        await product.save();
        updatedCount++;
        totalVariantsUpdated += variantsUpdated;
        console.log(`  ✅ Updated ${variantsUpdated} variants`);
      } else {
        console.log(`  ✓ All prices correct`);
      }
    }

    console.log('\n🎉 Price correction completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Products checked: ${products.length}`);
    console.log(`   - Products updated: ${updatedCount}`);
    console.log(`   - Total variants corrected: ${totalVariantsUpdated}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixStalePrices();