const fs = require('fs');
const path = require('path');

console.log('🏷️ Adding brand offer data attribute...');

const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Add brand offer data attribute
const pattern = /data-category-offer="<%= categoryOffer %>"\s*data-product-offer="<%= productOffer %>"/g;
const replacement = 'data-category-offer="<%= categoryOffer %>"\n                data-brand-offer="<%= brandOffer %>"\n                data-product-offer="<%= productOffer %>"';

const updatedContent = content.replace(pattern, replacement);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ Brand offer data attribute added successfully!');
} else {
  console.log('⚠️ No changes made - pattern not found or already updated');
}

console.log('\n🎉 Brand offer attribute update completed!');