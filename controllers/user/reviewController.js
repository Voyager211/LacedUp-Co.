const Review = require('../../models/Review');
const Product = require('../../models/Product');
const { isAuthenticated } = require('../../middlewares/auth');

// Submit a new review
exports.submitReview = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ 
        success: false, 
        message: 'You must be logged in to submit a review' 
      });
    }

    const { productId, rating, title, comment } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!productId || !rating || !title || !comment) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
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

    if (comment.length > 1000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Review comment must be 1000 characters or less' 
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

    // Create new review
    const newReview = new Review({
      user: userId,
      product: productId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim(),
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
exports.getProductReviews = async (req, res) => {
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
