const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Fixed typo: "filesize" ➜ "fileSize"
    fileFilter: (req, file, cb) => {
        try {
            const ext = path.extname(file.originalname);
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase())) {
                return cb(new Error('Only image files are allowed'), false);
            }
            cb(null, true);
        } catch (error) {
            console.error('Error in multer fileFilter:', error);
            cb(new Error('File upload error'), false);
        }
    }
});

module.exports = upload;
