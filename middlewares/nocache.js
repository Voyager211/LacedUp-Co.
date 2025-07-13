const nocache = (req, res, next) => {
  // Comprehensive cache control headers to prevent back button access
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
};

module.exports = nocache;