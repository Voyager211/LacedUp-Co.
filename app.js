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
const adminProductRoutes = require('./routes/admin/product');
const landingRoutes = require('./routes/user/landing');
const userAuthRoutes = require('./routes/user/auth');
const userHomeRoutes = require('./routes/user/home');
const userProductRoutes = require('./routes/user/product-routes');

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

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'yourSecretKey',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    client: mongoose.connection.getClient(),
    ttl: 20 * 60
  }),
  cookie: {
    maxAge: 20 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

app.use(addUserContext);

// Check if user is blocked on every request (after passport session)
app.use(checkUserBlocked);

// ROUTES
// ✅ User Routes First
app.use('/', landingRoutes);
app.use('/', userAuthRoutes);
app.use('/', userHomeRoutes);
app.use('/', userProductRoutes);



// ✅ Admin Routes
app.use('/admin', adminAuthRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/admin/categories', adminCategoryRoutes);
app.use('/admin/products', adminProductRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
