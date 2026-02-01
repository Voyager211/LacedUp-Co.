const { getHomepageProducts, getActiveCategories, getActiveBrands } = require('../../utils/product-sections');

const getHome = async (req, res) => {
  try {
    const { newArrivals, bestSellers } = await getHomepageProducts();
    const categories = await getActiveCategories();
    const brands = await getActiveBrands(); // Add this

    res.render('user/home', {
      title: 'Welcome',
      layout: 'user/layouts/user-layout',
      active: 'home',
      newArrivals,
      bestSellers,
      categories,
      brands, // Add this
      user: req.user || null
    });
  } catch (err) {
    console.error('Home Page Error:', err);
    res.status(500).send('Failed to load home page');
  }
};

module.exports = {
  getHome
}
