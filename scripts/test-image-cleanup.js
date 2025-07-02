const { getImagesToDelete, deleteFiles } = require('../utils/fileCleanup');
const fs = require('fs').promises;
const path = require('path');

/**
 * Test script to verify image cleanup functionality
 */
async function testImageCleanup() {
  console.log('🧪 Testing Image Cleanup Functionality');
  console.log('=====================================\n');

  // Test 1: getImagesToDelete function
  console.log('Test 1: getImagesToDelete function');
  console.log('----------------------------------');

  const oldImages = [
    '/uploads/products/image1.webp',
    '/uploads/products/image2.webp',
    '/uploads/products/image3.webp',
    '/uploads/products/image4.webp'
  ];

  const newImages = [
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...', // New base64 image
    '/uploads/products/image2.webp', // Kept existing image
    '/uploads/products/image3.webp', // Kept existing image
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...' // Another new base64 image
  ];

  const imagesToDelete = getImagesToDelete(oldImages, newImages);
  
  console.log('Old images:', oldImages);
  console.log('New images (with base64):', newImages.map(img => 
    img.startsWith('data:') ? '[BASE64_IMAGE]' : img
  ));
  console.log('Images to delete:', imagesToDelete);
  
  const expectedToDelete = ['/uploads/products/image1.webp', '/uploads/products/image4.webp'];
  const testPassed = JSON.stringify(imagesToDelete.sort()) === JSON.stringify(expectedToDelete.sort());
  
  console.log(`✅ Test 1 ${testPassed ? 'PASSED' : 'FAILED'}`);
  if (!testPassed) {
    console.log('   Expected:', expectedToDelete);
    console.log('   Got:', imagesToDelete);
  }
  console.log('');

  // Test 2: File deletion with mock files
  console.log('Test 2: File deletion functionality');
  console.log('-----------------------------------');

  const testDir = path.join(process.cwd(), 'public', 'uploads', 'test');
  const testFiles = [
    '/uploads/test/test1.webp',
    '/uploads/test/test2.webp',
    '/uploads/test/nonexistent.webp'
  ];

  try {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files
    await fs.writeFile(path.join(testDir, 'test1.webp'), 'test content 1');
    await fs.writeFile(path.join(testDir, 'test2.webp'), 'test content 2');
    
    console.log('Created test files');
    
    // Test deletion
    const deleteResult = await deleteFiles(testFiles);
    
    console.log('Deletion results:', deleteResult);
    
    // Verify files are deleted
    const file1Exists = await fs.access(path.join(testDir, 'test1.webp')).then(() => true).catch(() => false);
    const file2Exists = await fs.access(path.join(testDir, 'test2.webp')).then(() => true).catch(() => false);
    
    const deletionWorked = !file1Exists && !file2Exists;
    console.log(`✅ Test 2 ${deletionWorked ? 'PASSED' : 'FAILED'}`);
    
    if (!deletionWorked) {
      console.log('   File 1 still exists:', file1Exists);
      console.log('   File 2 still exists:', file2Exists);
    }
    
    // Cleanup test directory
    await fs.rmdir(testDir, { recursive: true });
    console.log('Cleaned up test directory');
    
  } catch (error) {
    console.error('❌ Test 2 FAILED with error:', error.message);
  }
  
  console.log('');

  // Test 3: Edge cases
  console.log('Test 3: Edge cases');
  console.log('------------------');

  // Empty arrays
  const emptyResult = getImagesToDelete([], []);
  console.log('Empty arrays result:', emptyResult);
  console.log(`✅ Empty arrays: ${emptyResult.length === 0 ? 'PASSED' : 'FAILED'}`);

  // All images kept
  const allKeptResult = getImagesToDelete(oldImages, oldImages);
  console.log('All images kept result:', allKeptResult);
  console.log(`✅ All kept: ${allKeptResult.length === 0 ? 'PASSED' : 'FAILED'}`);

  // All images deleted
  const allDeletedResult = getImagesToDelete(oldImages, ['data:image/jpeg;base64,newimage']);
  console.log('All images deleted result:', allDeletedResult);
  console.log(`✅ All deleted: ${allDeletedResult.length === oldImages.length ? 'PASSED' : 'FAILED'}`);

  console.log('\n🎉 Image cleanup functionality test completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testImageCleanup().catch(console.error);
}

module.exports = { testImageCleanup };
