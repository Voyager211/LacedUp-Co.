const Product = require('../../models/Product');

exports.showLanding = async (req, res) => {
  try {
    // Get latest arrivals
    const newArrivals = await Product.find({ isDeleted: false, isBlocked: false })
      .sort({ createdAt: -1 })
      .limit(4);

    // Get best sellers based on 'sold' field
    const bestSellers = await Product.find({ isDeleted: false, isBlocked: false })
      .sort({ sold: -1 })
      .limit(4);

    console.log('New:', newArrivals.length, 'Best:', bestSellers.length);
    console.log('Sample product:', bestSellers[0]);
    
    res.render('user/landing', {
      title: 'Welcome',
      layout: 'user/layouts/user-layout',
      active: 'home',
      newArrivals,
      bestSellers,
      user: req.user || null
    });
  } catch (err) {
    console.error('Landing Page Error:', err);
    res.status(500).send('Failed to load landing page');
  }
};
