const multer = require('multer');
const path = require('path');
const { isValidExtension, isValidMimeType, MAX_FILE_SIZE } = require('../utils/imageValidation');

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE }, // 20 MB limit from validation utility
    fileFilter: (req, file, cb) => {
        try {
            // Validate file extension
            if (!isValidExtension(file.originalname)) {
                return cb(new Error('Please select a valid image file. Only JPG, PNG, GIF, WEBP, BMP, and SVG files are allowed.'), false);
            }

            // Validate MIME type for additional security
            if (!isValidMimeType(file.mimetype)) {
                return cb(new Error('Invalid file type detected. Please select a valid image file.'), false);
            }

            cb(null, true);
        } catch (error) {
            console.error('Error in multer fileFilter:', error);
            cb(new Error('File upload error'), false);
        }
    }
});

module.exports = upload;
