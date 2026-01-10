const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { body, validationResult } = require('express-validator');

const router = express.Router();

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const registerValidation = [
  body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
  body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  body('role')
      .optional()
      .isIn(['ADMIN', 'VERIFIER'])
      .withMessage('Invalid role'),

  body('profile')
      .exists()
      .withMessage('Profile information is required'),
  body('profile.firstName')
      .notEmpty()
      .trim()
      .withMessage('First name is required'),
  body('profile.lastName')
      .notEmpty()
      .trim()
      .withMessage('Last name is required'),
  body('profile.phone')
      .optional()
      .trim(),

  body('collegeCode')
      .if((value, { req }) => req.body.role === 'ADMIN' || !req.body.companyName)
      .notEmpty()
      .withMessage('College code is required for educational institutions')
      .isLength({ min: 2, max: 10 })
      .withMessage('College code must be 2-10 characters')
      .optional({ checkFalsy: true }),

  body('companyName')
      .if((value, { req }) => req.body.role === 'VERIFIER' || !req.body.collegeCode)
      .notEmpty()
      .withMessage('Company name is required for verifiers')
      .isLength({ min: 2, max: 100 })
      .withMessage('Company name must be 2-100 characters')
      .optional({ checkFalsy: true }),

  body().custom((value, { req }) => {
    const hasCollegeCode = req.body.collegeCode && req.body.collegeCode.trim();
    const hasCompanyName = req.body.companyName && req.body.companyName.trim();

    if (!hasCollegeCode && !hasCompanyName) {
      throw new Error('Either college code or company name must be provided');
    }

    if (hasCollegeCode && hasCompanyName) {
      throw new Error('Please provide either college code or company name, not both');
    }

    return true;
  })
];

const loginValidation = [
  body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
  body('password')
      .notEmpty()
      .withMessage('Password is required')
];

const profileUpdateValidation = [
  body('profile.firstName')
      .optional()
      .notEmpty()
      .trim()
      .withMessage('First name cannot be empty'),
  body('profile.lastName')
      .optional()
      .notEmpty()
      .trim()
      .withMessage('Last name cannot be empty'),
  body('profile.phone')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number'),
  body('walletAddress')
      .optional()
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Invalid wallet address format')
];

router.post('/register', registerValidation, validateRequest, authController.register);
router.post('/login', loginValidation, validateRequest, authController.login);
router.post('/logout', authController.logout);

router.get('/profile', authMiddleware.requireAuth(), authController.getProfile);
router.put('/profile', authMiddleware.requireAuth(), profileUpdateValidation, validateRequest, authController.updateProfile);

router.get('/verify-token', authMiddleware.requireAuth(), (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user
    }
  });
});

module.exports = router;