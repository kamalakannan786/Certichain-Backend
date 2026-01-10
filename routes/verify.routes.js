const express = require('express');
const verifyController = require('../controllers/verify.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { param, body, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware
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

// Certificate ID validation
const certificateIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid certificate ID format')
];

// Hash validation
const hashValidation = [
  param('hash')
    .matches(/^[a-fA-F0-9]{64}$/)
    .withMessage('Invalid certificate hash format')
];

// QR code validation
const qrCodeValidation = [
  body('qrData')
    .notEmpty()
    .trim()
    .withMessage('QR code data is required')
];

// Public Routes (No authentication required)

// Verify certificate by ID
router.get('/certificate/:id',
  certificateIdValidation,
  validateRequest,
  verifyController.verifyCertificateById
);

// Verify certificate by hash
router.get('/hash/:hash',
  hashValidation,
  validateRequest,
  verifyController.verifyCertificateByHash
);

// Verify certificate by QR code data
router.post('/qr-code',
  qrCodeValidation,
  validateRequest,
  verifyController.verifyByQRCode
);

// Get verification statistics (public)
router.get('/statistics',
  verifyController.getVerificationStats
);

// Batch verification endpoint
router.post('/batch',
  body('certificates').isArray({ min: 1, max: 20 }).withMessage('Certificates array required (max 20)'),
  body('certificates.*').custom((value) => {
    // Check if it's a valid certificate ID or hash
    if (typeof value === 'string') {
      if (value.match(/^[0-9a-fA-F]{24}$/) || value.match(/^[a-fA-F0-9]{64}$/)) {
        return true;
      }
    }
    throw new Error('Invalid certificate identifier');
  }),
  validateRequest,
  async (req, res) => {
    try {
      const { certificates } = req.body;
      const results = [];

      for (const certId of certificates) {
        try {
          let result;
          
          // Check if it's a hash or ID
          if (certId.match(/^[a-fA-F0-9]{64}$/)) {
            // It's a hash
            req.params = { hash: certId };
            result = await new Promise((resolve, reject) => {
              verifyController.verifyCertificateByHash(req, {
                json: resolve,
                status: () => ({ json: reject })
              });
            });
          } else {
            // It's an ID
            req.params = { id: certId };
            result = await new Promise((resolve, reject) => {
              verifyController.verifyCertificateById(req, {
                json: resolve,
                status: () => ({ json: reject })
              });
            });
          }

          results.push({
            identifier: certId,
            success: true,
            ...result
          });
        } catch (error) {
          results.push({
            identifier: certId,
            success: false,
            isValid: false,
            error: error.message || 'Verification failed'
          });
        }
      }

      res.json({
        success: true,
        message: 'Batch verification completed',
        data: { results }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Batch verification failed',
        error: error.message
      });
    }
  }
);

// Protected Routes (Optional authentication for enhanced features)

// Advanced verification with user context
router.get('/advanced/:id',
  authMiddleware.optionalAuthentication(),
  certificateIdValidation,
  validateRequest,
  async (req, res) => {
    try {
      // Call the regular verification
      await verifyController.verifyCertificateById(req, {
        json: (result) => {
          // Add user-specific enhancements if authenticated
          if (req.user) {
            result.data.userContext = {
              canEdit: req.user.role === 'ADMIN',
              canRevoke: req.user.role === 'ADMIN',
              isOwner: result.data.certificate.student?.id === req.user.id
            };
          }
          
          res.json(result);
        },
        status: (code) => ({
          json: (result) => res.status(code).json(result)
        })
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Advanced verification failed',
        error: error.message
      });
    }
  }
);

// Verification history (for authenticated users)
router.get('/history/my',
  authMiddleware.requireAuth(),
  async (req, res) => {
    try {
      // This would require a verification log model in a full implementation
      res.json({
        success: true,
        message: 'Verification history endpoint',
        data: {
          verifications: [],
          note: 'Verification history tracking would be implemented here'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch verification history',
        error: error.message
      });
    }
  }
);

module.exports = router;