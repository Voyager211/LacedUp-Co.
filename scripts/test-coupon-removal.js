const fs = require('fs');
const path = require('path');

function testCouponRemoval() {
  console.log('🧪 Testing Coupon Functionality Removal');
  console.log('=======================================');

  const productDetailsPath = path.join(__dirname, '../views/user/product-details.ejs');
  
  try {
    // Read the product details file
    const fileContent = fs.readFileSync(productDetailsPath, 'utf8');
    
    console.log('\n🔍 Checking for Coupon-related Elements:');
    console.log('========================================');
    
    // Test 1: Check for "Apply Coupon" text
    const applyCouponMatches = fileContent.match(/Apply Coupon/gi);
    if (applyCouponMatches) {
      console.log('❌ FAIL: Found "Apply Coupon" text:', applyCouponMatches.length, 'occurrences');
      applyCouponMatches.forEach((match, index) => {
        console.log(`   ${index + 1}. "${match}"`);
      });
    } else {
      console.log('✅ PASS: No "Apply Coupon" text found');
    }
    
    // Test 2: Check for coupon-related keywords
    const couponKeywords = ['coupon', 'Coupon', 'COUPON'];
    let couponKeywordFound = false;
    
    couponKeywords.forEach(keyword => {
      const matches = fileContent.match(new RegExp(keyword, 'g'));
      if (matches) {
        console.log(`❌ FAIL: Found "${keyword}" keyword:`, matches.length, 'occurrences');
        couponKeywordFound = true;
      }
    });
    
    if (!couponKeywordFound) {
      console.log('✅ PASS: No coupon-related keywords found');
    }
    
    // Test 3: Check for ticket icon (bi-ticket)
    const ticketIconMatches = fileContent.match(/bi-ticket/gi);
    if (ticketIconMatches) {
      console.log('❌ FAIL: Found ticket icon (bi-ticket):', ticketIconMatches.length, 'occurrences');
    } else {
      console.log('✅ PASS: No ticket icon (bi-ticket) found');
    }
    
    // Test 4: Check for coupon-related CSS classes
    const couponCssMatches = fileContent.match(/coupon-|\.coupon/gi);
    if (couponCssMatches) {
      console.log('❌ FAIL: Found coupon-related CSS:', couponCssMatches.length, 'occurrences');
    } else {
      console.log('✅ PASS: No coupon-related CSS found');
    }
    
    console.log('\n🔍 Verifying Existing Functionality Preserved:');
    console.log('==============================================');
    
    // Test 5: Check variant selection functionality
    const variantSelectionMatches = fileContent.match(/selectVariant|size-btn|VARIANT SELECTION/gi);
    if (variantSelectionMatches && variantSelectionMatches.length >= 3) {
      console.log('✅ PASS: Variant selection functionality preserved');
    } else {
      console.log('❌ FAIL: Variant selection functionality may be missing');
    }
    
    // Test 6: Check add to cart functionality
    const addToCartMatches = fileContent.match(/add-to-cart|Add to Cart/gi);
    if (addToCartMatches && addToCartMatches.length >= 2) {
      console.log('✅ PASS: Add to cart functionality preserved');
    } else {
      console.log('❌ FAIL: Add to cart functionality may be missing');
    }
    
    // Test 7: Check price display functionality
    const priceDisplayMatches = fileContent.match(/current-price|discount-badge/gi);
    if (priceDisplayMatches && priceDisplayMatches.length >= 2) {
      console.log('✅ PASS: Price display functionality preserved');
    } else {
      console.log('❌ FAIL: Price display functionality may be missing');
    }
    
    // Test 8: Check stock display functionality
    const stockDisplayMatches = fileContent.match(/stock-badge|updateStockDisplay/gi);
    if (stockDisplayMatches && stockDisplayMatches.length >= 2) {
      console.log('✅ PASS: Stock display functionality preserved');
    } else {
      console.log('❌ FAIL: Stock display functionality may be missing');
    }
    
    // Test 9: Check deselection functionality (recently added)
    const deselectionMatches = fileContent.match(/deselectVariant|initializeDefaultState/gi);
    if (deselectionMatches && deselectionMatches.length >= 2) {
      console.log('✅ PASS: Variant deselection functionality preserved');
    } else {
      console.log('❌ FAIL: Variant deselection functionality may be missing');
    }
    
    console.log('\n📊 Code Quality Checks:');
    console.log('=======================');
    
    // Test 10: Check for broken HTML structure
    const openDivs = (fileContent.match(/<div/g) || []).length;
    const closeDivs = (fileContent.match(/<\/div>/g) || []).length;
    
    if (openDivs === closeDivs) {
      console.log('✅ PASS: HTML div tags are balanced');
    } else {
      console.log(`❌ FAIL: HTML div tags unbalanced (${openDivs} open, ${closeDivs} close)`);
    }
    
    // Test 11: Check for JavaScript syntax issues (basic check)
    const jsErrors = [];
    
    // Check for unmatched brackets in JavaScript sections
    const scriptSections = fileContent.match(/<script[\s\S]*?<\/script>/gi);
    if (scriptSections) {
      scriptSections.forEach((section, index) => {
        const openBraces = (section.match(/{/g) || []).length;
        const closeBraces = (section.match(/}/g) || []).length;
        
        if (openBraces !== closeBraces) {
          jsErrors.push(`Script section ${index + 1}: Unmatched braces (${openBraces} open, ${closeBraces} close)`);
        }
      });
    }
    
    if (jsErrors.length === 0) {
      console.log('✅ PASS: No obvious JavaScript syntax issues detected');
    } else {
      console.log('❌ FAIL: Potential JavaScript syntax issues:');
      jsErrors.forEach(error => console.log(`   - ${error}`));
    }
    
    console.log('\n🎯 Summary:');
    console.log('===========');
    
    const totalTests = 11;
    let passedTests = 0;
    
    // Count passed tests based on our checks above
    if (!applyCouponMatches) passedTests++;
    if (!couponKeywordFound) passedTests++;
    if (!ticketIconMatches) passedTests++;
    if (!couponCssMatches) passedTests++;
    if (variantSelectionMatches && variantSelectionMatches.length >= 3) passedTests++;
    if (addToCartMatches && addToCartMatches.length >= 2) passedTests++;
    if (priceDisplayMatches && priceDisplayMatches.length >= 2) passedTests++;
    if (stockDisplayMatches && stockDisplayMatches.length >= 2) passedTests++;
    if (deselectionMatches && deselectionMatches.length >= 2) passedTests++;
    if (openDivs === closeDivs) passedTests++;
    if (jsErrors.length === 0) passedTests++;
    
    console.log(`✅ Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Tests Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ALL TESTS PASSED! Coupon functionality successfully removed.');
      console.log('   ✅ No coupon-related elements remain');
      console.log('   ✅ All existing functionality preserved');
      console.log('   ✅ Code structure maintained');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the issues above.');
    }
    
  } catch (error) {
    console.error('❌ Error reading product details file:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testCouponRemoval();
}

module.exports = { testCouponRemoval };
