const mongoose = require ('mongoose');
const bcrypt = require('bcryptjs');


const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  profilePhoto: { type: String }, // Profile photo filename

  // Auth
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  isBlocked: { type: Boolean, default: false },
  blockedAt: { type: Date },

  // OTP
  otpHash: { type: String },
  otpExpiresAt: { type: Date },

  // SSO
  googleId: { type: String },
  facebookId: { type: String },

  // Password reset tracking
  passwordResetAt: { type: Date }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);