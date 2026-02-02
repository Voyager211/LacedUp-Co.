const getAbout = async (req, res) => {
  try {
    res.render('user/about', {
      title: 'About Us - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'about',
      user: req.user || null
    });
  } catch (err) {
    console.error('About Page Error:', err);
    res.status(500).send('Failed to load about page');
  }
};

module.exports = {
  getAbout
};
