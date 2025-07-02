require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('MongoDB connected for verification');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Verification function
const verifyBasePrices = async () => {
  try {
    console.log('🔍 Verifying basePrice implementation...\n');
    
    // Find all products
    const products = await Product.find({ isDeleted: false }).select('productName variants regularPrice');
    
    console.log(`📊 Found ${products.length} products to verify:\n`);
    
    let allGood = true;
    
    for (const product of products) {
      console.log(`📦 Product: ${product.productName}`);
      console.log(`   Regular Price: ₹${product.regularPrice}`);
      
      if (!product.variants || product.variants.length === 0) {
        console.log('   ❌ No variants found');
        allGood = false;
        continue;
      }
      
      console.log(`   📏 Variants (${product.variants.length}):`);
      
      for (const variant of product.variants) {
        const hasBasePrice = variant.basePrice !== undefined && variant.basePrice !== null;
        const basePriceValue = hasBasePrice ? `₹${variant.basePrice}` : 'MISSING';
        const status = hasBasePrice ? '✅' : '❌';
        
        console.log(`      ${status} ${variant.size}: basePrice = ${basePriceValue}, stock = ${variant.stock}`);
        
        if (!hasBasePrice) {
          allGood = false;
        }
      }
      console.log('');
    }
    
    if (allGood) {
      console.log('🎉 All products have proper basePrice implementation!');
    } else {
      console.log('⚠️  Some products are missing basePrice fields. Run the migration script.');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
};

// Run verification
const runVerification = async () => {
  try {
    await connectDB();
    await verifyBasePrices();
    console.log('\n✅ Verification completed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  runVerification();
}

module.exports = { verifyBasePrices };
