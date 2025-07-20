const fs = require('fs');
const path = require('path');

// Read the product details file
const filePath = path.join(__dirname, 'views/user/product-details.ejs');
let content = fs.readFileSync(filePath, 'utf8');

console.log('🔧 Fixing frontend price calculation...');

// Fix 1: Add brandOffer to the fallback calculation
const fallbackPattern = /const maxOffer = Math\.max\(categoryOffer,?\s*productOffer,?\s*variantOffer\);/g;
content = content.replace(fallbackPattern, 'const maxOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);');

// Fix 2: Add brandOffer to the variant calculation
const variantPattern = /const appliedOffer = Math\.max\(categoryOffer,?\s*productOffer,?\s*variantOffer\);/g;
content = content.replace(variantPattern, 'const appliedOffer = Math.max(categoryOffer, brandOffer, productOffer, variantOffer);');

// Fix 3: Add brandOffer variable declaration in fallback calculation
const fallbackSectionPattern = /(const categoryOffer = \(product\.category && product\.category\.categoryOffer\) \|\| 0;\s*)(const productOffer = product\.productOffer \|\| 0;)/g;
content = content.replace(fallbackSectionPattern, '$1const brandOffer = (product.brand && product.brand.brandOffer) || 0;\n                $2');

// Fix 4: Add brandOffer variable declaration in variant calculation
const variantSectionPattern = /(\/\/ Determine which offer is being applied \(category,?\s*product,?\s*or variant\)\s*const categoryOffer = \(product\.category && product\.category\.categoryOffer\) \|\| 0;\s*)(const productOffer = product\.productOffer \|\| 0;)/g;
content = content.replace(variantSectionPattern, '$1const brandOffer = (product.brand && product.brand.brandOffer) || 0;\n                  $2');

// Fix 5: Update the offer type detection to include brand
const offerTypePattern = /(if \(categoryOffer === appliedOffer\) \{\s*offerType = 'category';\s*\} else if \(productOffer === appliedOffer\) \{\s*offerType = 'product';\s*\} else \{\s*offerType = 'variant';\s*\})/g;
content = content.replace(offerTypePattern, `if (categoryOffer === appliedOffer) {
                      offerType = 'category';
                    } else if (brandOffer === appliedOffer) {
                      offerType = 'brand';
                    } else if (productOffer === appliedOffer) {
                      offerType = 'product';
                    } else {
                      offerType = 'variant';
                    }`);

// Write the fixed content back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Frontend price calculation fixed!');
console.log('📝 Changes made:');
console.log('   - Added brandOffer to Math.max() calculations');
console.log('   - Added brandOffer variable declarations');
console.log('   - Updated offer type detection to include brand offers');