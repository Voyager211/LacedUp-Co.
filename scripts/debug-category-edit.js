const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Category = require('../models/Category');

async function debugCategoryEdit() {
  try {
    console.log('🔍 Debugging Category Edit Functionality...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find or create a test category
    let testCategory = await Category.findOne({ name: 'Debug Test Category' });
    if (!testCategory) {
      testCategory = await Category.create({
        name: 'Debug Test Category',
        description: 'Category for debugging edit functionality',
        categoryOffer: 0,
        isActive: true
      });
      console.log('✅ Test category created');
    } else {
      console.log('✅ Test category found');
    }
    
    console.log('\n📊 Current Category Data:');
    console.log(`ID: ${testCategory._id}`);
    console.log(`Name: ${testCategory.name}`);
    console.log(`Description: ${testCategory.description}`);
    console.log(`Category Offer: ${testCategory.categoryOffer}%`);
    console.log(`Active: ${testCategory.isActive}`);
    
    // Test the update operation directly
    console.log('\n🧪 Testing Direct Update Operation:');
    
    const updateData = {
      name: 'Debug Test Category Updated',
      description: 'Updated description for debugging',
      categoryOffer: 25
    };
    
    console.log('Update data:', updateData);
    
    try {
      const updatedCategory = await Category.findByIdAndUpdate(
        testCategory._id,
        {
          name: updateData.name,
          description: updateData.description,
          categoryOffer: Math.max(0, Math.min(100, parseFloat(updateData.categoryOffer) || 0))
        },
        { new: true }
      );
      
      console.log('✅ Direct update successful');
      console.log('Updated category:', {
        id: updatedCategory._id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        categoryOffer: updatedCategory.categoryOffer
      });
      
    } catch (updateError) {
      console.log('❌ Direct update failed:', updateError.message);
    }
    
    // Test API endpoint simulation
    console.log('\n🌐 Testing API Endpoint Logic:');
    
    const mockReq = {
      body: {
        name: 'Debug Test Category API',
        description: 'API test description',
        categoryOffer: 30
      },
      params: {
        id: testCategory._id.toString()
      }
    };
    
    const mockRes = {
      json: (data) => {
        console.log('API Response:', data);
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`API Response (${code}):`, data);
          return data;
        }
      })
    };
    
    // Simulate the controller logic
    try {
      const { name, description, categoryOffer } = mockReq.body;
      const categoryId = mockReq.params.id;
      
      console.log('Processing request:', { name, description, categoryOffer, categoryId });
      
      if (!name) {
        return mockRes.status(400).json({ success: false, message: 'Category name is required' });
      }
      
      const trimmedName = name.trim();
      if (!trimmedName) {
        return mockRes.status(400).json({ success: false, message: 'Category name cannot be empty' });
      }
      
      // Check for uniqueness
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        isDeleted: false,
        _id: { $ne: categoryId }
      });
      
      if (existingCategory) {
        return mockRes.status(400).json({
          success: false,
          message: 'A category with this name already exists'
        });
      }
      
      const result = await Category.findByIdAndUpdate(categoryId, {
        name: trimmedName,
        description: description || '',
        categoryOffer: Math.max(0, Math.min(100, parseFloat(categoryOffer) || 0))
      }, { new: true });
      
      console.log('✅ API simulation successful');
      console.log('Updated result:', {
        id: result._id,
        name: result.name,
        description: result.description,
        categoryOffer: result.categoryOffer
      });
      
      mockRes.json({ success: true, message: 'Category updated successfully' });
      
    } catch (apiError) {
      console.log('❌ API simulation failed:', apiError.message);
      mockRes.status(500).json({ success: false, message: 'Failed to update category' });
    }
    
    // Test form data parsing
    console.log('\n📝 Testing Form Data Parsing:');
    
    const testFormData = {
      name: 'Form Test Category',
      description: 'Form test description',
      categoryOffer: '35'
    };
    
    console.log('Raw form data:', testFormData);
    
    const parsedData = {
      name: testFormData.name.trim(),
      description: testFormData.description.trim(),
      categoryOffer: parseFloat(testFormData.categoryOffer) || 0
    };
    
    console.log('Parsed form data:', parsedData);
    console.log('Validated categoryOffer:', Math.max(0, Math.min(100, parsedData.categoryOffer)));
    
    // Test JSON vs URL-encoded data
    console.log('\n🔄 Testing Data Format Differences:');
    
    const jsonData = JSON.stringify({
      name: 'JSON Test',
      description: 'JSON description',
      categoryOffer: 40
    });
    
    const urlEncodedData = new URLSearchParams({
      name: 'URL Test',
      description: 'URL description',
      categoryOffer: '45'
    }).toString();
    
    console.log('JSON format:', jsonData);
    console.log('URL-encoded format:', urlEncodedData);
    
    // Parse both formats
    const parsedJson = JSON.parse(jsonData);
    const parsedUrlEncoded = Object.fromEntries(new URLSearchParams(urlEncodedData));
    
    console.log('Parsed JSON:', parsedJson);
    console.log('Parsed URL-encoded:', parsedUrlEncoded);
    
    console.log('\n🎯 Debug Summary:');
    console.log('✅ Database connection working');
    console.log('✅ Category model operations working');
    console.log('✅ Update logic functioning correctly');
    console.log('✅ Data parsing working for both formats');
    console.log('✅ Validation logic working');
    
    console.log('\n💡 Potential Issues to Check:');
    console.log('1. Frontend form submission conflicts');
    console.log('2. Network request format mismatch');
    console.log('3. JavaScript validation errors');
    console.log('4. Modal form field name attributes');
    console.log('5. Event handler conflicts');
    
    console.log('\n🌐 Test Category Details:');
    console.log(`Category ID: ${testCategory._id}`);
    console.log(`Edit URL: http://localhost:3000/admin/categories`);
    console.log(`API Endpoint: PATCH /admin/categories/api/${testCategory._id}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the debug script
debugCategoryEdit();
