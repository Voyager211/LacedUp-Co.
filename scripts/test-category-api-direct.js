const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Category = require('../models/Category');

async function testCategoryApiDirect() {
  try {
    console.log('🧪 Testing Category API Endpoint Directly...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find the test category
    const testCategory = await Category.findOne({ name: 'Edit Test Category' });
    
    if (!testCategory) {
      console.log('❌ Test category not found. Creating one...');
      const newCategory = await Category.create({
        name: 'Edit Test Category',
        description: 'Test category for API testing',
        categoryOffer: 5,
        isActive: true
      });
      console.log('✅ Test category created:', newCategory._id);
      testCategory = newCategory;
    }
    
    console.log('📊 Current Category Data:');
    console.log(`ID: ${testCategory._id}`);
    console.log(`Name: ${testCategory.name}`);
    console.log(`Description: ${testCategory.description}`);
    console.log(`Category Offer: ${testCategory.categoryOffer}%`);
    
    // Test the API endpoint using fetch (simulating frontend request)
    console.log('\n🌐 Testing API Endpoint with fetch...');
    
    const testData = {
      name: 'Edit Test Category Updated',
      description: 'Updated description via API test',
      categoryOffer: 25
    };
    
    console.log('📤 Sending test data:', testData);
    
    try {
      // Import fetch for Node.js
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(`http://localhost:3000/admin/categories/api/${testCategory._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'admin_session=test' // You might need a valid session
        },
        body: JSON.stringify(testData)
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ API Response:', responseData);
        
        // Verify the update in database
        const updatedCategory = await Category.findById(testCategory._id);
        console.log('\n📊 Updated Category Data:');
        console.log(`Name: ${updatedCategory.name}`);
        console.log(`Description: ${updatedCategory.description}`);
        console.log(`Category Offer: ${updatedCategory.categoryOffer}%`);
        
        if (updatedCategory.categoryOffer === testData.categoryOffer) {
          console.log('✅ Category offer updated successfully!');
        } else {
          console.log('❌ Category offer not updated');
        }
        
      } else {
        const errorText = await response.text();
        console.log('❌ API Error Response:', errorText);
      }
      
    } catch (fetchError) {
      console.log('❌ Fetch Error:', fetchError.message);
      
      // If fetch fails, test with direct controller call
      console.log('\n🔧 Testing with direct controller call...');
      
      const categoryController = require('../controllers/admin/categoryController');
      
      const mockReq = {
        body: testData,
        params: { id: testCategory._id.toString() }
      };
      
      const mockRes = {
        json: (data) => {
          console.log('✅ Controller Response:', data);
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`❌ Controller Error (${code}):`, data);
            return data;
          }
        })
      };
      
      await categoryController.apiUpdateCategory(mockReq, mockRes);
      
      // Verify the update
      const updatedCategory = await Category.findById(testCategory._id);
      console.log('\n📊 Updated Category Data (Direct):');
      console.log(`Name: ${updatedCategory.name}`);
      console.log(`Description: ${updatedCategory.description}`);
      console.log(`Category Offer: ${updatedCategory.categoryOffer}%`);
    }
    
    console.log('\n💡 Frontend Debugging Tips:');
    console.log('1. Check if the server is running on http://localhost:3000');
    console.log('2. Verify admin authentication/session');
    console.log('3. Check browser console for JavaScript errors');
    console.log('4. Verify form field names match exactly');
    console.log('5. Check if FormValidator is preventing submission');
    
    console.log('\n🔍 Common Issues:');
    console.log('- 304 Not Modified: Request not reaching server or cached');
    console.log('- 401 Unauthorized: Admin session expired');
    console.log('- 400 Bad Request: Invalid data format');
    console.log('- JavaScript errors: FormValidator or form field issues');
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testCategoryApiDirect();
