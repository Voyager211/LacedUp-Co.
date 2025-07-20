const fs = require('fs');
const path = require('path');

console.log('🏷️ Updating extra discount badge messages...');

const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the offer label logic
const oldPattern = /\/\/ Show the applied offer with appropriate label based on offer type\s*let offerLabel = 'Extra';\s*if \(offerType === 'category'\) \{\s*offerLabel = 'Category';\s*\} else if \(offerType === 'product'\) \{\s*offerLabel = 'Product';\s*\} else if \(offerType === 'variant'\) \{\s*offerLabel = 'Extra';\s*\}\s*extraDiscountBadge\.innerHTML = `<i class="bi bi-tag-fill me-1"><\/i>\$\{offerLabel\} \$\{appliedOffer\}% off`;/g;

const newPattern = `// Show the applied offer with descriptive messages based on offer type
            let offerMessage = '';
            if (offerType === 'variant') {
              offerMessage = \`Extra \${appliedOffer}% off on this size!\`;
            } else if (offerType === 'product') {
              offerMessage = \`Extra \${appliedOffer}% off on this sneaker!\`;
            } else if (offerType === 'category') {
              // Get category name from the product data
              const categoryName = '<%= product.category.name %>';
              offerMessage = \`Extra \${appliedOffer}% off on all \${categoryName}!\`;
            } else if (offerType === 'brand') {
              // Get brand name from the product data
              const brandName = '<%= product.brand.name %>';
              offerMessage = \`Extra \${appliedOffer}% off on all \${brandName} sneakers!\`;
            }

            extraDiscountBadge.innerHTML = \`<i class="bi bi-tag-fill me-1"></i>\${offerMessage}\`;`;

// Replace the pattern
const updatedContent = content.replace(oldPattern, newPattern);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ Badge messages updated successfully!');
  console.log('📝 New badge messages:');
  console.log('   - Variant: "Extra X% off on this size!"');
  console.log('   - Product: "Extra X% off on this sneaker!"');
  console.log('   - Category: "Extra X% off on all [Category]!"');
  console.log('   - Brand: "Extra X% off on all [Brand] sneakers!"');
} else {
  console.log('⚠️ No changes made - pattern not found or already updated');
}

console.log('\n🎉 Badge message update completed!');