/**
 * Comprehensive Image Validation Utility
 * Handles both client-side and server-side image file validation
 */

// Allowed image file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

// Allowed MIME types for additional security
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml'
];

// Maximum file size (20 MB in bytes)
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Validate file extension
 * @param {string} filename - The filename to validate
 * @returns {boolean} - True if extension is allowed
 */
function isValidExtension(filename) {
  if (!filename) return false;
  
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Validate MIME type
 * @param {string} mimeType - The MIME type to validate
 * @returns {boolean} - True if MIME type is allowed
 */
function isValidMimeType(mimeType) {
  if (!mimeType) return false;
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validate file size
 * @param {number} fileSize - The file size in bytes
 * @returns {boolean} - True if file size is within limits
 */
function isValidFileSize(fileSize) {
  return fileSize <= MAX_FILE_SIZE;
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Client-side file validation
 * @param {File} file - The file object to validate
 * @returns {Object} - Validation result with isValid boolean and message
 */
function validateImageFile(file) {
  if (!file) {
    return { isValid: false, message: 'No file selected.' };
  }

  // Check file extension
  if (!isValidExtension(file.name)) {
    return { 
      isValid: false, 
      message: 'Please select a valid image file. Only JPG, PNG, GIF, WEBP, BMP, and SVG files are allowed.' 
    };
  }

  // Check MIME type for additional security
  if (!isValidMimeType(file.type)) {
    return { 
      isValid: false, 
      message: 'Invalid file type detected. Please select a valid image file.' 
    };
  }

  // Check file size
  if (!isValidFileSize(file.size)) {
    return { 
      isValid: false, 
      message: `Image file size must not exceed 20 MB. Please choose a smaller image. Current size: ${formatFileSize(file.size)}` 
    };
  }

  return { isValid: true, message: 'File is valid.' };
}

/**
 * Validate multiple files
 * @param {FileList|Array} files - Array of files to validate
 * @returns {Object} - Validation result with details for each file
 */
function validateMultipleImageFiles(files) {
  const results = {
    isValid: true,
    validFiles: [],
    invalidFiles: [],
    errors: []
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validation = validateImageFile(file);
    
    if (validation.isValid) {
      results.validFiles.push(file);
    } else {
      results.isValid = false;
      results.invalidFiles.push({
        file: file,
        error: validation.message
      });
      results.errors.push(`${file.name}: ${validation.message}`);
    }
  }

  return results;
}

/**
 * Server-side validation for base64 images
 * @param {string} base64String - Base64 encoded image string
 * @param {string} filename - Original filename (optional)
 * @returns {Object} - Validation result
 */
function validateBase64Image(base64String, filename = '') {
  if (!base64String) {
    return { isValid: false, message: 'No image data provided.' };
  }

  // Check if it's a valid base64 image string
  const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp|bmp|svg\+xml);base64,/;
  if (!base64Regex.test(base64String)) {
    return { 
      isValid: false, 
      message: 'Invalid image format. Please select a valid image file.' 
    };
  }

  // Extract and validate MIME type from base64 string
  const mimeTypeMatch = base64String.match(/^data:([^;]+);base64,/);
  if (!mimeTypeMatch || !isValidMimeType(mimeTypeMatch[1])) {
    return { 
      isValid: false, 
      message: 'Please select a valid image file. Only JPG, PNG, GIF, WEBP, BMP, and SVG files are allowed.' 
    };
  }

  // Estimate file size from base64 string (approximate)
  const base64Data = base64String.split(',')[1];
  const estimatedSize = (base64Data.length * 3) / 4;
  
  if (!isValidFileSize(estimatedSize)) {
    return { 
      isValid: false, 
      message: `Image file size must not exceed 20 MB. Please choose a smaller image. Estimated size: ${formatFileSize(estimatedSize)}` 
    };
  }

  // Validate filename if provided
  if (filename && !isValidExtension(filename)) {
    return { 
      isValid: false, 
      message: 'Please select a valid image file. Only JPG, PNG, GIF, WEBP, BMP, and SVG files are allowed.' 
    };
  }

  return { isValid: true, message: 'Image is valid.' };
}

// Export for Node.js (server-side)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateImageFile,
    validateMultipleImageFiles,
    validateBase64Image,
    isValidExtension,
    isValidMimeType,
    isValidFileSize,
    formatFileSize,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE
  };
}

// Export for browser (client-side)
if (typeof window !== 'undefined') {
  window.ImageValidator = {
    validateImageFile,
    validateMultipleImageFiles,
    validateBase64Image,
    isValidExtension,
    isValidMimeType,
    isValidFileSize,
    formatFileSize,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE
  };
}
