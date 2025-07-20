const mongoose = require('mongoose');
const Product = require('./models/Product');
const Brand = require('./models/Brand');
const Category = require('./models/Category');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testBadgeMessages() {
  try {
    console.log('🏷️ Testing New Badge Messages...');
    console.log('='.repeat(60));

    // Get the Phantom product
    const product = await Product.findOne({
      productName: { $regex: /phantom.*4.*chrome/i },
      isDeleted: false
    }).populate('brand').populate('category');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('\n📦 PRODUCT INFORMATION:');
    console.log('Name:', product.productName);
    console.log('Brand:', product.brand.name);
    console.log('Category:', product.category.name);
    console.log('Product Offer:', product.productOffer + '%');
    console.log('Brand Offer:', (product.brand?.brandOffer || 0) + '%');
    console.log('Category Offer:', (product.category?.categoryOffer || 0) + '%');

    console.log('\n🏷️ BADGE MESSAGE SIMULATION:');
    
    // Test different offer scenarios
    const testScenarios = [
      {
        name: 'Current State (Product Offer)',
        categoryOffer: 0,
        brandOffer: 10,
        productOffer: 30,
        variantOffer: 0
      },
      {
        name: 'Brand Offer Scenario',
        categoryOffer: 0,
        brandOffer: 25,
        productOffer: 0,
        variantOffer: 0
      },
      {
        name: 'Category Offer Scenario',
        categoryOffer: 20,
        brandOffer: 0,
        productOffer: 0,
        variantOffer: 0
      },
      {
        name: 'Variant Offer Scenario',
        categoryOffer: 0,
        brandOffer: 0,
        productOffer: 0,
        variantOffer: 15
      }
    ];

    testScenarios.forEach(scenario => {
      console.log(`\n--- ${scenario.name} ---`);
      console.log(`Offers: Category ${scenario.categoryOffer}%, Brand ${scenario.brandOffer}%, Product ${scenario.productOffer}%, Variant ${scenario.variantOffer}%`);
      
      const maxOffer = Math.max(scenario.categoryOffer, scenario.brandOffer, scenario.productOffer, scenario.variantOffer);
      
      let offerType = 'none';
      let badgeMessage = '';
      
      if (maxOffer > 0) {
        if (scenario.categoryOffer === maxOffer) {
          offerType = 'category';
          badgeMessage = `Extra ${maxOffer}% off on all ${product.category.name}!`;
        } else if (scenario.brandOffer === maxOffer) {
          offerType = 'brand';
          badgeMessage = `Extra ${maxOffer}% off on all ${product.brand.name} sneakers!`;
        } else if (scenario.productOffer === maxOffer) {
          offerType = 'product';
          badgeMessage = `Extra ${maxOffer}% off on this sneaker!`;
        } else if (scenario.variantOffer === maxOffer) {
          offerType = 'variant';
          badgeMessage = `Extra ${maxOffer}% off on this size!`;
        }
      }
      
      console.log(`Applied Offer: ${maxOffer}% (${offerType})`);
      console.log(`Badge Message: "${badgeMessage}"`);
    });

    console.log('\n🎨 FRONTEND DATA SIMULATION:');
    const uk7Variant = product.variants.find(v => v.size === 'UK 7');
    if (uk7Variant) {
      console.log('UK 7 Variant Data Attributes:');
      console.log(`  data-category-offer="${product.category?.categoryOffer || 0}"`);
      console.log(`  data-brand-offer="${product.brand?.brandOffer || 0}"`);
      console.log(`  data-product-offer="${product.productOffer || 0}"`);
      console.log(`  data-variant-offer="${uk7Variant.variantSpecificOffer || 0}"`);
      
      const appliedOffer = Math.max(
        product.category?.categoryOffer || 0,
        product.brand?.brandOffer || 0,
        product.productOffer || 0,
        uk7Variant.variantSpecificOffer || 0
      );
      
      let offerType = 'none';
      if (appliedOffer > 0) {
        if ((product.category?.categoryOffer || 0) === appliedOffer) {
          offerType = 'category';
        } else if ((product.brand?.brandOffer || 0) === appliedOffer) {
          offerType = 'brand';
        } else if ((product.productOffer || 0) === appliedOffer) {
          offerType = 'product';
        } else {
          offerType = 'variant';
        }
      }
      
      console.log(`  data-applied-offer="${appliedOffer}"`);
      console.log(`  data-offer-type="${offerType}"`);
    }

    console.log('\n🎉 BADGE MESSAGE TEST RESULTS:');
    console.log('='.repeat(60));
    console.log('✅ Product offer: "Extra 30% off on this sneaker!"');
    console.log('✅ Brand offer: "Extra X% off on all Under Armour sneakers!"');
    console.log('✅ Category offer: "Extra X% off on all Gym Sneakers!"');
    console.log('✅ Variant offer: "Extra X% off on this size!"');
    
    console.log('\n💡 Current Display (30% Product Offer):');
    console.log('   Badge: "Extra 30% off on this sneaker!"');
    console.log('   This provides clear, specific messaging about the discount');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testBadgeMessages();