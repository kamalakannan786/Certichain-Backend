const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const College = require('../models/College.model');
const databaseConfig = require('../config/database');

class AuthController {
  constructor() {
    this.loginAttempts = new Map(); // In-memory rate limiting
    this.maxAttempts = 5;
    this.lockoutTime = 15 * 60 * 1000; // 15 minutes

    // Bind methods to preserve 'this' context
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.logout = this.logout.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }

  // Enhanced register with caching and validation
  async register(req, res) {
    const startTime = Date.now();

    try {
      const { email, password, role, profile, collegeCode, companyName } = req.body;

      // Check cache first for existing user
      const cacheKey = `user:${email.toLowerCase()}`;
      const cachedUser = await databaseConfig.getCache(cacheKey);

      if (cachedUser) {
        return res.status(409).json({
          success: false,
          message: 'User already exists',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Check database
      const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();
      if (existingUser) {
        // Cache the result to avoid future DB queries
        await databaseConfig.setCache(cacheKey, { exists: true }, 3600);

        return res.status(409).json({
          success: false,
          message: 'User already exists',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Find college if role is ADMIN with caching
      let college = null;
      if (role === 'ADMIN') {
        if (!collegeCode) {
          return res.status(400).json({
            success: false,
            message: 'College code required for admin role',
            responseTime: `${Date.now() - startTime}ms`
          });
        }

        const collegeCacheKey = `college:${collegeCode.toUpperCase()}`;
        college = await databaseConfig.getCache(collegeCacheKey);

        if (!college) {
          college = await College.findOne({ code: collegeCode.toUpperCase() }).lean();
          if (college) {
            await databaseConfig.setCache(collegeCacheKey, college, 7200); // Cache for 2 hours
          }
        }

        if (!college) {
          return res.status(400).json({
            success: false,
            message: 'Invalid college code',
            responseTime: `${Date.now() - startTime}ms`
          });
        }
      }

      // Generate unique API code automatically
      const apiCodePrefix = college ? college.code : 'IND';
      const apiCode = `${apiCodePrefix}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const userData = {
        email: email.toLowerCase(),
        password,
        role: role || 'VERIFIER',
        profile: {
          ...profile,
          companyName: role === 'VERIFIER' ? companyName : undefined
        },
        college: college?._id,
        createdAt: new Date(),
        lastLogin: new Date()
      };

      const user = new User(userData);
      await user.save();

      // Generate JWT token with optimized payload
      const token = this.generateToken(user._id, user.role);

      // Prepare response data
      const responseData = {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          college: college?.name
        },
        token
      };

      // Cache user data for future requests
      await databaseConfig.setCache(`user:${user._id}`, responseData.user, 1800); // 30 minutes

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: responseData,
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error('Registration error:', error);

      // Handle specific MongoDB errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(409).json({
          success: false,
          message: `${field} already exists`,
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Enhanced login with rate limiting and caching
  async login(req, res) {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress;

    try {
      const { email, password } = req.body;
      const emailLower = email.toLowerCase();

      // Check rate limiting
      const attemptKey = `${clientIP}:${emailLower}`;
      const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };

      if (attempts.count >= this.maxAttempts) {
        const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
        if (timeSinceLastAttempt < this.lockoutTime) {
          return res.status(429).json({
            success: false,
            message: 'Too many login attempts. Please try again later.',
            retryAfter: Math.ceil((this.lockoutTime - timeSinceLastAttempt) / 1000),
            responseTime: `${Date.now() - startTime}ms`
          });
        } else {
          // Reset attempts after lockout period
          this.loginAttempts.delete(attemptKey);
        }
      }

      // Try cache first for user data
      const userCacheKey = `user_login:${emailLower}`;
      let user = await databaseConfig.getCache(userCacheKey);

      if (!user) {
        // Find user and populate college with lean query for performance
        user = await User.findOne({ email: emailLower })
          .populate('college', 'name code')
          .lean();

        if (user) {
          // Cache user data (without password)
          const { password: _, ...userWithoutPassword } = user;
          await databaseConfig.setCache(userCacheKey, userWithoutPassword, 1800); // 30 minutes
        }
      }

      if (!user) {
        this.recordFailedAttempt(attemptKey);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // For cached user, we need to get the actual user object for password comparison
      let actualUser = user;
      if (!user.comparePassword) {
        actualUser = await User.findById(user._id);
      }

      // Safety check if user was found in cache but not in DB anymore
      if (!actualUser) {
        this.recordFailedAttempt(attemptKey);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Check password
      const isPasswordValid = await actualUser.comparePassword(password);
      if (!isPasswordValid) {
        this.recordFailedAttempt(attemptKey);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Clear failed attempts on successful login
      this.loginAttempts.delete(attemptKey);

      // Update last login (async, don't wait)
      User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).exec().catch(console.error);

      // Generate token with enhanced payload
      const token = this.generateToken(user._id, user.role);

      // Prepare response
      const responseData = {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          college: user.college
        },
        token
      };

      // Update user cache
      await databaseConfig.setCache(`user:${user._id}`, responseData.user, 1800);

      res.json({
        success: true,
        message: 'Login successful',
        data: responseData,
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  recordFailedAttempt(attemptKey) {
    const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(attemptKey, attempts);
  }

  // Enhanced profile retrieval with caching
  async getProfile(req, res) {
    const startTime = Date.now();

    try {
      const userId = req.user.id;

      // Try cache first
      const cacheKey = `user:${userId}`;
      let user = await databaseConfig.getCache(cacheKey);

      if (!user) {
        user = await User.findById(userId)
          .populate('college', 'name code address contact')
          .select('-password')
          .lean();

        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'User not found',
            responseTime: `${Date.now() - startTime}ms`
          });
        }

        // Cache the result
        await databaseConfig.setCache(cacheKey, user, 1800); // 30 minutes
      }

      res.json({
        success: true,
        data: { user },
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error('Profile fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Enhanced profile update with cache invalidation
  async updateProfile(req, res) {
    const startTime = Date.now();

    try {
      const { profile, walletAddress } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          responseTime: `${Date.now() - startTime}ms`
        });
      }

      // Update fields
      if (profile) {
        user.profile = { ...user.profile, ...profile };
      }

      if (walletAddress) {
        user.walletAddress = walletAddress;
      }

      await user.save();

      // Invalidate caches
      await Promise.all([
        databaseConfig.deleteCache(`user:${userId}`),
        databaseConfig.deleteCache(`user_login:${user.email}`)
      ]);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: user.toJSON() },
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({
        success: false,
        message: 'Profile update failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Enhanced JWT token generation
  generateToken(userId, role) {
    const payload = {
      userId,
      role,
      iat: Math.floor(Date.now() / 1000),
      jti: Math.random().toString(36).substring(2, 15) // JWT ID for token tracking
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'certichain-api',
        audience: 'certichain-client'
      }
    );
  }

  // Logout with token blacklisting (if needed)
  async logout(req, res) {
    const startTime = Date.now();

    try {
      // In a production environment, you might want to blacklist the token
      // For now, we'll just return success as the client will remove the token

      res.json({
        success: true,
        message: 'Logged out successfully',
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Cleanup method for rate limiting map
  cleanup() {
    const now = Date.now();
    for (const [key, attempts] of this.loginAttempts.entries()) {
      if (now - attempts.lastAttempt > this.lockoutTime) {
        this.loginAttempts.delete(key);
      }
    }
  }
}

// Cleanup rate limiting data every 30 minutes
const authController = new AuthController();
setInterval(() => authController.cleanup(), 30 * 60 * 1000);

module.exports = authController;