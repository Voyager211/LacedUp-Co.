// Simple test controller to debug the cart issue
exports.addToCart = async (req, res) => {
  console.log('=== TEST CONTROLLER REACHED ===');
  console.log('Request body:', req.body);
  
  try {
    res.json({
      success: true,
      message: 'Test controller working',
      data: req.body
    });
  } catch (error) {
    console.error('Error in test controller:', error);
    res.status(500).json({
      success: false,
      message: 'Test controller error',
      error: error.message
    });
  }
};