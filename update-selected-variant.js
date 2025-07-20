const fs = require('fs');
const path = require('path');

console.log('🏷️ Updating selectedVariant object...');

const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Update selectedVariant object to include brandOffer
const pattern = /selectedVariant = \{ size, stock, price, basePrice, appliedOffer, offerType, categoryOffer, productOffer, variantOffer, variantIndex \};/g;
const replacement = 'selectedVariant = { size, stock, price, basePrice, appliedOffer, offerType, categoryOffer, brandOffer, productOffer, variantOffer, variantIndex };';

const updatedContent = content.replace(pattern, replacement);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ selectedVariant object updated successfully!');
} else {
  console.log('⚠️ No changes made - pattern not found or already updated');
}

console.log('\n🎉 selectedVariant update completed!');