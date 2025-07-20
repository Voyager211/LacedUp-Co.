const mongoose = require('mongoose');
const Brand = require('./models/Brand');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/lacedup', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkBrandOffers() {
  try {
    console.log('🔍 Checking all brand offers...');

    const brands = await Brand.find({ isDeleted: false });

    console.log('\n🏷️ All Brands:');
    brands.forEach(brand => {
      console.log(`${brand.name}: ${brand.brandOffer}% offer (Active: ${brand.isActive})`);
    });

    // Find brands with offers > 0
    const brandsWithOffers = brands.filter(brand => brand.brandOffer > 0);
    console.log('\n💰 Brands with offers:');
    if (brandsWithOffers.length === 0) {
      console.log('No brands have offers set.');
    } else {
      brandsWithOffers.forEach(brand => {
        console.log(`${brand.name}: ${brand.brandOffer}% offer`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkBrandOffers();