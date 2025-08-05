require('dotenv').config(); // ✅ Load .env FIRST

// Package imports
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const passport = require('passport');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

// Middleware imports
const connectDB = require('./config/db');
const isAdmin = require('./middlewares/isAdmin');
const { addUserContext } = require('./middlewares/user-middleware');
const checkUserBlocked = require('./middlewares/checkUserBlocked');

// Route imports
const adminAuthRoutes = require('./routes/admin/auth');
const adminUserRoutes = require('./routes/admin/user');
const adminCategoryRoutes = require('./routes/admin/category');
const adminBrandRoutes = require('./routes/admin/brand');
const adminProductRoutes = require('./routes/admin/product');
const adminOrderRoutes = require('./routes/admin/order');
const adminReturnRoutes = require('./routes/admin/returns');
const landingRoutes = require('./routes/user/landing');
const userAuthRoutes = require('./routes/user/auth');
const userHomeRoutes = require('./routes/user/home');
const userProductRoutes = require('./routes/user/product-routes');
const userReviewRoutes = require('./routes/user/review-routes');
const userProfileRoutes = require('./routes/user/profile-routes');
const userAddressRoutes = require('./routes/user/address-routes');
const userCartRoutes = require('./routes/user/cart-routes');
const userWishlistRoutes = require('./routes/user/wishlist-routes');
const userOrderRoutes = require('./routes/user/order-routes');
const userWalletRoutes = require('./routes/user/wallet-routes');

require('./config/passport')(passport); // ✅ Load passport config

// Connect DB
connectDB();

// View engine
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'admin/layout'); // default for admin

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(flash());

// Session configuration with dynamic session names and durations based on route
app.use((req, res, next) => {
  // Determine session name and duration based on route
  const isAdminRoute = req.path.startsWith('/admin');
  const sessionName = isAdminRoute ? 'admin.sid' : 'user.sid';

  // Different session durations: 60 minutes for admin, 20 minutes for user
  const sessionDuration = isAdminRoute ? 60 * 60 : 20 * 60; // in seconds
  const cookieMaxAge = sessionDuration * 1000; // in milliseconds

  // Apply session middleware with appropriate name and duration
  const sessionMiddleware = session({
    name: sessionName,
    secret: process.env.SESSION_SECRET || 'yourSecretKey',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      ttl: sessionDuration
    }),
    cookie: {
      maxAge: cookieMaxAge,
      httpOnly: true,
      sameSite: 'lax'
    }
  });

  sessionMiddleware(req, res, next);
});

// Passport
app.use(passport.initialize());
app.use(passport.session());

app.use(addUserContext);

// Check if user is blocked on every request (after passport session)
app.use(checkUserBlocked);

// Make Geoapify API key available to all templates
app.locals.geoapifyApiKey = process.env.GEOAPIFY_API_KEY;

// ROUTES
// ✅ User Routes First
app.use('/', landingRoutes);
app.use('/', userAuthRoutes);
app.use('/', userHomeRoutes);
app.use('/', userProductRoutes);
app.use('/', userReviewRoutes);
app.use('/', userProfileRoutes);
app.use('/', userAddressRoutes);
app.use('/cart', userCartRoutes);
app.use('/wishlist', userWishlistRoutes);
app.use('/', userOrderRoutes);
app.use('/', userWalletRoutes);



// ✅ Admin Routes
app.use('/admin', adminAuthRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/admin/categories', adminCategoryRoutes);
app.use('/admin/brands', adminBrandRoutes);
app.use('/admin/products', adminProductRoutes);
app.use('/admin/orders', adminOrderRoutes);
app.use('/admin/returns', adminReturnRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});