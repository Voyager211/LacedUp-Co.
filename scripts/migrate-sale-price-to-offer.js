const mongoose = require('mongoose');
require('dotenv').config();

// Define the old schema structure for migration
const oldVariantSchema = new mongoose.Schema({
  size: String,
  stock: Number,
  salePrice: Number
}, { _id: true });

const oldProductSchema = new mongoose.Schema({
  productName: String,
  regularPrice: Number,
  variants: [oldVariantSchema]
}, { timestamps: true });

const OldProduct = mongoose.model('OldProduct', oldProductSchema, 'products');

// Define the new schema structure
const newVariantSchema = new mongoose.Schema({
  size: String,
  stock: Number,
  productOffer: Number
}, { _id: true });

const newProductSchema = new mongoose.Schema({
  productName: String,
  regularPrice: Number,
  variants: [newVariantSchema]
}, { timestamps: true });

const NewProduct = mongoose.model('NewProduct', newProductSchema, 'products');

async function migrateSalePriceToOffer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lacedUp');
    console.log('✅ Connected to MongoDB');

    // Find all products with the old schema
    const products = await OldProduct.find({});
    console.log(`📦 Found ${products.length} products to migrate`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        console.log(`\n🔄 Processing: ${product.productName}`);
        
        let hasChanges = false;
        const updatedVariants = [];

        for (const variant of product.variants) {
          if (variant.salePrice !== undefined) {
            // Calculate productOffer percentage from salePrice
            // Formula: productOffer = ((regularPrice - salePrice) / regularPrice) * 100
            let productOffer = 0;
            
            if (product.regularPrice > 0 && variant.salePrice < product.regularPrice) {
              productOffer = ((product.regularPrice - variant.salePrice) / product.regularPrice) * 100;
              productOffer = Math.round(productOffer * 100) / 100; // Round to 2 decimal places
            }

            console.log(`   ${variant.size}: ₹${variant.salePrice} → ${productOffer}% off (from ₹${product.regularPrice})`);
            
            updatedVariants.push({
              _id: variant._id,
              size: variant.size,
              stock: variant.stock,
              productOffer: productOffer
            });
            
            hasChanges = true;
          } else if (variant.productOffer !== undefined) {
            // Already migrated
            console.log(`   ${variant.size}: Already migrated (${variant.productOffer}% off)`);
            updatedVariants.push(variant);
          } else {
            // No pricing info, set default
            console.log(`   ${variant.size}: No pricing info, setting 0% off`);
            updatedVariants.push({
              _id: variant._id,
              size: variant.size,
              stock: variant.stock,
              productOffer: 0
            });
            hasChanges = true;
          }
        }

        if (hasChanges) {
          // Update the product with new variant structure
          await NewProduct.findByIdAndUpdate(product._id, {
            $set: { variants: updatedVariants },
            $unset: { 'variants.$[].salePrice': 1 }
          });
          
          console.log(`✅ Updated: ${product.productName}`);
          updatedCount++;
        } else {
          console.log(`⏭️  Skipped: ${product.productName} (already migrated)`);
          skippedCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing ${product.productName}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Updated: ${updatedCount} products`);
    console.log(`⏭️  Skipped: ${skippedCount} products (already migrated)`);
    console.log(`❌ Errors: ${errorCount} products`);
    console.log(`📦 Total: ${products.length} products processed`);

    // Verification
    console.log('\n🔍 Verification:');
    const verificationProducts = await NewProduct.find({}).limit(5);
    for (const product of verificationProducts) {
      console.log(`\n📋 ${product.productName} (Regular: ₹${product.regularPrice}):`);
      for (const variant of product.variants) {
        const calculatedSalePrice = product.regularPrice * (1 - (variant.productOffer || 0) / 100);
        console.log(`   ${variant.size}: ${variant.productOffer}% off = ₹${calculatedSalePrice.toFixed(2)}`);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  migrateSalePriceToOffer();
}

module.exports = { migrateSalePriceToOffer };
