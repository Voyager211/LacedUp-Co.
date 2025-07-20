const fs = require('fs');
const path = require('path');

console.log('🏷️ Updating initializeDefaultState function...');

const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Update the variants mapping in initializeDefaultState to include brandOffer
const pattern = /categoryOffer: parseFloat\(btn\.dataset\.categoryOffer\) \|\| 0,\s*productOffer: parseFloat\(btn\.dataset\.productOffer\) \|\| 0,\s*variantOffer: parseFloat\(btn\.dataset\.variantOffer\) \|\| 0/g;
const replacement = `categoryOffer: parseFloat(btn.dataset.categoryOffer) || 0,
        brandOffer: parseFloat(btn.dataset.brandOffer) || 0,
        productOffer: parseFloat(btn.dataset.productOffer) || 0,
        variantOffer: parseFloat(btn.dataset.variantOffer) || 0`;

const updatedContent = content.replace(pattern, replacement);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ initializeDefaultState function updated successfully!');
} else {
  console.log('⚠️ No changes made - pattern not found or already updated');
}

console.log('\n🎉 initializeDefaultState update completed!');