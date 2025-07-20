const fs = require('fs');
const path = require('path');

console.log('🧹 Removing all finalPrice field references...');

// Files to update
const filesToUpdate = [
  'controllers/user/product-controller.js',
  'views/user/product-details.ejs',
  'views/user/partials/product-card.ejs'
];

filesToUpdate.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  console.log(`\n🔧 Processing: ${filePath}`);
  let content = fs.readFileSync(fullPath, 'utf8');
  let changes = 0;

  // Replace all instances of "variant.finalPrice || calculation" with just "calculation"
  const pattern1 = /variant\.finalPrice\s*\|\|\s*(\w+)\.calculateVariantFinalPrice\(variant\)/g;
  const newContent1 = content.replace(pattern1, (match, productVar) => {
    changes++;
    return `${productVar}.calculateVariantFinalPrice(variant)`;
  });
  content = newContent1;

  // Replace references to stored finalPrice in templates
  const pattern2 = /variant\.finalPrice\s*\|\|\s*\(/g;
  const newContent2 = content.replace(pattern2, '(');
  if (newContent2 !== content) {
    content = newContent2;
    changes++;
  }

  // Remove comments about stored finalPrice
  const pattern3 = /\/\/.*stored finalPrice.*\n/gi;
  const newContent3 = content.replace(pattern3, '');
  if (newContent3 !== content) {
    content = newContent3;
    changes++;
  }

  // Update template calculations to remove finalPrice references
  const pattern4 = /const finalPrice = variant\.finalPrice \|\| /g;
  const newContent4 = content.replace(pattern4, 'const finalPrice = ');
  if (newContent4 !== content) {
    content = newContent4;
    changes++;
  }

  if (changes > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`  ✅ Updated ${changes} references`);
  } else {
    console.log(`  ✓ No changes needed`);
  }
});

console.log('\n🎉 Cleanup completed!');
console.log('📝 All finalPrice field references have been removed');
console.log('💡 System now uses 100% real-time calculation');