const fs = require('fs').promises;
const path = require('path');

/**
 * Delete a file from the file system if it exists
 * @param {string} filePath - The file path to delete (e.g., '/uploads/products/image.webp')
 * @returns {Promise<boolean>} - True if file was deleted or didn't exist, false if error occurred
 */
const deleteFile = async (filePath) => {
  try {
    // Convert relative path to absolute path
    const absolutePath = path.join(process.cwd(), 'public', filePath);
    
    // Check if file exists before attempting to delete
    await fs.access(absolutePath);
    
    // Delete the file
    await fs.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is fine
      console.log(`ℹ️ File not found (already deleted): ${filePath}`);
      return true;
    } else {
      console.error(`❌ Error deleting file ${filePath}:`, error.message);
      return false;
    }
  }
};

/**
 * Delete multiple files from the file system
 * @param {string[]} filePaths - Array of file paths to delete
 * @returns {Promise<{deleted: string[], failed: string[]}>} - Results of deletion attempts
 */
const deleteFiles = async (filePaths) => {
  const results = {
    deleted: [],
    failed: []
  };

  for (const filePath of filePaths) {
    const success = await deleteFile(filePath);
    if (success) {
      results.deleted.push(filePath);
    } else {
      results.failed.push(filePath);
    }
  }

  return results;
};

/**
 * Compare old and new image arrays and return images that should be deleted
 * @param {string[]} oldImages - Array of old image URLs
 * @param {string[]} newImages - Array of new image URLs (base64 or URLs)
 * @returns {string[]} - Array of image URLs that should be deleted
 */
const getImagesToDelete = (oldImages, newImages) => {
  // Filter out base64 images from newImages (they are new uploads)
  const newImageUrls = newImages.filter(img => !img.startsWith('data:'));
  
  // Find old images that are not in the new images array
  const imagesToDelete = oldImages.filter(oldImg => !newImageUrls.includes(oldImg));
  
    
  return imagesToDelete;
};

module.exports = {
  deleteFile,
  deleteFiles,
  getImagesToDelete
};