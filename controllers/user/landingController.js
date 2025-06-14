const Product = require('../../models/Product');

exports.showLanding = async (req, res) => {
  try {
    const newArrivals = await Product.find({ isDeleted: false, isBlocked: false })
      .sort({ createdAt: -1 })
      .limit(8);

    const bestSellers = [
      {
        _id: '6845b922f0e6e73471b7124c',
        productName: 'Lacoste L-Guard Breaker',
        brand: 'Lacoste',
        salePrice: 8545,
        regularPrice: 8995,
        mainImage: 'https://mockcdn.com/images/lacoste-block.jpg'
      },
      {
        _id: '6845b922f0e6e73471b7124d',
        productName: 'Zara Platform Color Block',
        brand: 'Zara',
        salePrice: 3790,
        regularPrice: 3990,
        mainImage: 'https://mockcdn.com/images/zara-colorblock.jpg'
      },
      {
        _id: '6845b922f0e6e73471b7124e',
        productName: 'Nike Air Max Alpha Trainer 5',
        brand: 'Nike',
        salePrice: 6930,
        regularPrice: 7295,
        mainImage: 'https://mockcdn.com/images/nike-black.jpg'
      },
      {
        _id: '6845b922f0e6e73471b7124f',
        productName: 'Under Armour Charged Engage',
        brand: 'Under Armour',
        salePrice: 6649,
        regularPrice: 6999,
        mainImage: 'https://mockcdn.com/images/ua-black.jpg'
      }
    ];

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
