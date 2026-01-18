const { getHomepageProducts } = require('../../utils/product-sections');

exports.showLanding = async (req, res) => {
  try {
    const { newArrivals, bestSellers } = await getHomepageProducts();

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
