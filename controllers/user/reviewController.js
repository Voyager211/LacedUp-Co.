const Review = require('../../models/Review');
const Product = require('../../models/Product');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { isAuthenticated } = require('../../middlewares/auth');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Middleware for handling multiple image uploads
const uploadReviewImages = upload.array('images', 5);

// Submit a new review
const submitReview = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'You must be logged in to submit a review'
      });
    }

    const { productId, rating, title, content } = req.body;
    const userId = req.user._id;
    const images = req.files || [];

    // Validate required fields
    if (!productId || !rating || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating must be between 1 and 5' 
      });
    }

    // Validate field lengths
    if (title.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Review title must be 100 characters or less'
      });
    }

    if (content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Review content must be 1000 characters or less'
      });
    }

    // Validate image count
    if (images.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 images allowed per review'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product || product.isDeleted || !product.isListed) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({ 
      user: userId, 
      product: productId 
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this product' 
      });
    }

    // Process and save images locally if any
    let imageUrls = [];
    if (images.length > 0) {
      try {
        // Ensure reviews upload directory exists
        const reviewsDir = path.join('public', 'uploads', 'reviews');
        if (!fs.existsSync(reviewsDir)) {
          fs.mkdirSync(reviewsDir, { recursive: true });
        }

        const processImagePromises = images.map(async (image, index) => {
          const filename = `${Date.now()}-${index}-${Math.random().toString(36).substring(7)}.webp`;
          const outputPath = path.join(reviewsDir, filename);

          // Process image with Sharp
          await sharp(image.buffer)
            .resize(800, 600, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ quality: 85 })
            .toFile(outputPath);

          return `/uploads/reviews/${filename}`;
        });

        imageUrls = await Promise.all(processImagePromises);
      } catch (uploadError) {
        console.error('Image processing error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process images. Please try again.'
        });
      }
    }

    // Create new review
    const newReview = new Review({
      user: userId,
      product: productId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: content.trim(),
      images: imageUrls,
      isVerifiedPurchase: false, // TODO: Check if user has purchased this product
      isHidden: false // Reviews are visible by default, can be moderated later
    });

    await newReview.save();

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        id: newReview._id,
        rating: newReview.rating,
        title: newReview.title,
        comment: newReview.comment,
        images: newReview.images,
        createdAt: newReview.createdAt
      }
    });

  } catch (error) {
    console.error('Review submission error:', error);
    
    // Handle duplicate review error (in case the unique index catches it)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this product' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit review. Please try again.' 
    });
  }
};

// Get reviews for a product (optional - for AJAX loading)
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ 
      product: productId, 
      isHidden: false 
    })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReviews = await Review.countDocuments({ 
      product: productId, 
      isHidden: false 
    });

    const totalPages = Math.ceil(totalReviews / limit);

    res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load reviews' 
    });
  }
};

module.exports = {
  uploadReviewImages,
  submitReview,
  getProductReviews
}