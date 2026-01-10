const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true // Add index for faster queries
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['ADMIN', 'VERIFIER'],
    default: 'VERIFIER',
    index: true // Add index for role-based queries
  },
  profile: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    companyName: { type: String, trim: true }
  },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: function() { return this.role === 'ADMIN'; },
    index: true // Add index for college-based queries
  },
  walletAddress: {
    type: String,
    sparse: true,
    index: true // Add sparse index for wallet queries
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true // Add index for active user queries
  },
  lastLogin: {
    type: Date,
    default: Date.now,
    index: true // Add index for login tracking
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Add index for creation date queries
  }
}, {
  timestamps: true,
  // Optimize for read performance
  read: 'secondaryPreferred',
  // Add compound indexes
  index: [
    { email: 1, isActive: 1 }, // Compound index for login queries
    { role: 1, college: 1 }, // Compound index for role-college queries
    { createdAt: -1 } // Index for sorting by creation date
  ]
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving with optimized rounds
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    // Use 10 rounds for better performance in high-load scenarios
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Optimized password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Account locking methods
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Get full name virtual
userSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Optimized JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject({ virtuals: true });
  delete user.password;
  delete user.loginAttempts;
  delete user.lockUntil;
  delete user.__v;
  return user;
};

// Static methods for optimized queries
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase(), isActive: true })
    .populate('college', 'name code')
    .lean();
};

userSchema.statics.findActiveUsers = function(limit = 100) {
  return this.find({ isActive: true })
    .select('-password -loginAttempts -lockUntil')
    .limit(limit)
    .lean();
};

userSchema.statics.findByRole = function(role, limit = 100) {
  return this.find({ role, isActive: true })
    .select('-password -loginAttempts -lockUntil')
    .populate('college', 'name code')
    .limit(limit)
    .lean();
};

// Indexes for performance
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ role: 1, college: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

module.exports = mongoose.model('User', userSchema);