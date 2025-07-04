// Debug script for category edit functionality
// Run this in browser console to test category edit

function debugCategoryEdit() {
  console.log('🔍 Starting Category Edit Debug...');
  
  // Find all edit forms
  const editForms = document.querySelectorAll('form[data-id]');
  console.log(`📝 Found ${editForms.length} edit forms`);
  
  if (editForms.length === 0) {
    console.log('❌ No edit forms found. Make sure categories are loaded.');
    return;
  }
  
  // Test the first form
  const testForm = editForms[0];
  const categoryId = testForm.dataset.id;
  console.log(`🎯 Testing form for category ID: ${categoryId}`);
  
  // Check form fields
  const nameField = testForm.querySelector('input[name="name"]');
  const descriptionField = testForm.querySelector('textarea[name="description"]');
  const categoryOfferField = testForm.querySelector('input[name="categoryOffer"]');
  
  console.log('🔍 Form fields check:', {
    nameField: nameField ? `Found: "${nameField.value}"` : 'NOT FOUND',
    descriptionField: descriptionField ? `Found: "${descriptionField.value}"` : 'NOT FOUND',
    categoryOfferField: categoryOfferField ? `Found: "${categoryOfferField.value}"` : 'NOT FOUND'
  });
  
  // Check FormValidator
  const validator = testForm.validator;
  console.log('🧪 FormValidator check:', {
    hasValidator: !!validator,
    hasSubmitForm: validator && typeof validator.submitForm === 'function',
    formId: testForm.id
  });
  
  // Test form data preparation
  if (nameField && descriptionField && categoryOfferField) {
    const testData = {
      name: nameField.value.trim(),
      description: descriptionField.value.trim(),
      categoryOffer: parseFloat(categoryOfferField.value) || 0
    };
    console.log('📤 Test form data:', testData);
    
    // Test API call directly
    console.log('🌐 Testing API call...');
    
    fetch(`/admin/categories/api/${categoryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    })
    .then(response => {
      console.log('📡 API Response status:', response.status);
      console.log('📡 API Response ok:', response.ok);
      return response.json();
    })
    .then(data => {
      console.log('✅ API Response data:', data);
    })
    .catch(error => {
      console.error('❌ API Error:', error);
    });
  }
}

function testCategoryOfferUpdate(categoryId, newOffer) {
  console.log(`🧪 Testing category offer update for ${categoryId} to ${newOffer}%`);
  
  const form = document.querySelector(`form[data-id="${categoryId}"]`);
  if (!form) {
    console.log('❌ Form not found for category:', categoryId);
    return;
  }
  
  const categoryOfferField = form.querySelector('input[name="categoryOffer"]');
  if (!categoryOfferField) {
    console.log('❌ Category offer field not found');
    return;
  }
  
  // Update the field value
  categoryOfferField.value = newOffer;
  console.log(`📝 Updated category offer field to: ${newOffer}`);
  
  // Trigger form submission
  if (form.validator && form.validator.submitForm) {
    console.log('🚀 Triggering FormValidator submission...');
    form.validator.submitForm();
  } else {
    console.log('❌ FormValidator not available');
  }
}

function listAllCategories() {
  console.log('📋 Listing all categories on page...');
  
  const rows = document.querySelectorAll('tbody tr');
  rows.forEach((row, index) => {
    const nameCell = row.querySelector('td:nth-child(2)');
    const offerCell = row.querySelector('td:nth-child(4)');
    const editBtn = row.querySelector('.btn-edit');
    
    if (nameCell && editBtn) {
      const categoryId = editBtn.dataset.id;
      console.log(`${index + 1}. ${nameCell.textContent} (ID: ${categoryId}) - Offer: ${offerCell ? offerCell.textContent : 'N/A'}`);
    }
  });
}

// Auto-run basic debug
console.log('🔧 Category Edit Debug Script Loaded');
console.log('Available functions:');
console.log('- debugCategoryEdit() - Run comprehensive debug');
console.log('- testCategoryOfferUpdate(categoryId, newOffer) - Test specific update');
console.log('- listAllCategories() - List all categories');

// Run basic debug automatically
setTimeout(() => {
  debugCategoryEdit();
}, 1000);
