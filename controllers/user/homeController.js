exports.getHome = (req, res) => {
  res.render('user/home', {
    title: 'Welcome',
    layout: 'user/layouts/user-layout',
    active: 'home',
    user: req.user
  });
};
