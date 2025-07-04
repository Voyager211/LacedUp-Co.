const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Category = require('../models/Category');

async function createTestCategoryForEdit() {
  try {
    console.log('🧪 Creating test category for edit functionality testing...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Delete existing test category if it exists
    await Category.deleteOne({ name: 'Edit Test Category' });
    
    // Create test category
    const testCategory = await Category.create({
      name: 'Edit Test Category',
      description: 'This category is for testing the edit functionality',
      categoryOffer: 5, // Start with 5% offer
      isActive: true
    });
    
    console.log('✅ Test category created successfully');
    
    console.log('\n📊 Category Details:');
    console.log(`ID: ${testCategory._id}`);
    console.log(`Name: ${testCategory.name}`);
    console.log(`Description: ${testCategory.description}`);
    console.log(`Category Offer: ${testCategory.categoryOffer}%`);
    console.log(`Active: ${testCategory.isActive}`);
    console.log(`Created: ${testCategory.createdAt}`);
    
    console.log('\n🌐 Test Instructions:');
    console.log('1. Open http://localhost:3000/admin/categories');
    console.log('2. Find "Edit Test Category" in the list');
    console.log('3. Click the "Edit" button');
    console.log('4. Try changing the Category Offer to 15%');
    console.log('5. Update the description to "Updated description for testing"');
    console.log('6. Click "Save Changes"');
    console.log('7. Check if the modal closes and the category is updated');
    
    console.log('\n🔍 Debugging Steps:');
    console.log('1. Open browser Developer Tools (F12)');
    console.log('2. Go to Console tab');
    console.log('3. Go to Network tab');
    console.log('4. Try editing the category');
    console.log('5. Look for any console errors or network request failures');
    
    console.log('\n📡 Expected Network Request:');
    console.log(`Method: PATCH`);
    console.log(`URL: /admin/categories/api/${testCategory._id}`);
    console.log(`Content-Type: application/json`);
    console.log(`Body: {"name":"Edit Test Category","description":"Updated description for testing","categoryOffer":15}`);
    
    console.log('\n✅ Expected Response:');
    console.log(`Status: 200 OK`);
    console.log(`Body: {"success":true,"message":"Category updated successfully"}`);
    
    console.log('\n❌ Common Issues to Check:');
    console.log('1. Form fields not found (check field names)');
    console.log('2. FormValidator not initialized properly');
    console.log('3. Network request blocked or failed');
    console.log('4. Backend validation errors');
    console.log('5. Modal not closing after successful update');
    
    console.log('\n🧪 Manual Test Cases:');
    console.log('Test 1: Change only category offer (5% → 15%)');
    console.log('Test 2: Change only description');
    console.log('Test 3: Change only name');
    console.log('Test 4: Change all fields at once');
    console.log('Test 5: Try invalid category offer (>100 or <0)');
    console.log('Test 6: Try empty name (should show validation error)');
    
  } catch (error) {
    console.error('❌ Failed to create test category:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestCategoryForEdit();
