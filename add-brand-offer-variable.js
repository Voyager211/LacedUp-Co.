const fs = require('fs');
const path = require('path');

console.log('🏷️ Adding brand offer variable to JavaScript...');

const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Add brand offer variable
const pattern = /const categoryOffer = parseFloat\(button\.dataset\.categoryOffer\) \|\| 0;\s*const productOffer = parseFloat\(button\.dataset\.productOffer\) \|\| 0;/g;
const replacement = `const categoryOffer = parseFloat(button.dataset.categoryOffer) || 0;
      const brandOffer = parseFloat(button.dataset.brandOffer) || 0;
      const productOffer = parseFloat(button.dataset.productOffer) || 0;`;

const updatedContent = content.replace(pattern, replacement);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ Brand offer variable added successfully!');
} else {
  console.log('⚠️ No changes made - pattern not found or already updated');
}

console.log('\n🎉 Brand offer variable update completed!');