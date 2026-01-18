const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');

module.exports = function (passport) {
  // Local strategy
  passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = await User.findOne({ email });
      if (!user) return done(null, false, { message: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: 'Invalid credentials' });

      // Check if user is blocked
      if (user.isBlocked) {
        return done(null, false, { message: 'Your account has been blocked. Please contact support.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  // Google strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          password: 'unused'
        });
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return done(null, false, { message: 'Your account has been blocked. Please contact support.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  // Facebook strategy
  // passport.use(new FacebookStrategy({
  //   clientID: process.env.FB_CLIENT_ID,
  //   clientSecret: process.env.FB_CLIENT_SECRET,
  //   callbackURL: '/auth/facebook/callback',
  //   profileFields: ['id', 'displayName', 'emails']
  // }, async (accessToken, refreshToken, profile, done) => {
  //   try {
  //     let user = await User.findOne({ facebookId: profile.id });

  //     if (!user) {
  //       user = await User.create({
  //         name: profile.displayName,
  //         email: profile.emails?.[0]?.value || '',
  //         facebookId: profile.id,
  //         password: 'unused'
  //       });
  //     }

  //     return done(null, user);
  //   } catch (err) {
  //     return done(err);
  //   }
  // }));

  // Serialize/Deserialize with role-based session keys
  passport.serializeUser((user, done) => {
    // Include role in serialization to separate admin and user sessions
    done(null, { id: user.id, role: user.role });
  });

  passport.deserializeUser(async (data, done) => {
    try {
      const user = await User.findById(data.id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
