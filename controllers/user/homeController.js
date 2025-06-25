const { getHomepageProducts } = require('../../utils/product-sections');

exports.getHome = async (req, res) => {
  try {
    const { newArrivals, bestSellers } = await getHomepageProducts();

    res.render('user/home', {
      title: 'Welcome',
      layout: 'user/layouts/user-layout',
      active: 'home',
      newArrivals,
      bestSellers,
      user: req.user || null
    });
  } catch (err) {
    console.error('Home Page Error:', err);
    res.status(500).send('Failed to load home page');
  }
};