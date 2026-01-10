const express = require('express');
const certificateController = require('../controllers/certificate.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { body, param, query, validationResult } = require('express-validator');

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

// Certificate issuance validation
const issueCertificateValidation = [
  // Student personal data
  body('studentData.name')
    .notEmpty()
    .trim()
    .withMessage('Student name is required'),
  body('studentData.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid student email is required'),
  body('studentData.studentId')
    .notEmpty()
    .trim()
    .withMessage('Student ID is required'),
  body('studentData.dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid date of birth required'),
  
  // Academic data
  body('academicData.degree')
    .notEmpty()
    .trim()
    .withMessage('Degree is required'),
  body('academicData.duration')
    .notEmpty()
    .trim()
    .withMessage('Course duration is required'),
  body('academicData.admissionYear')
    .isInt({ min: 1900, max: 2100 })
    .withMessage('Valid admission year is required'),
  body('academicData.graduationYear')
    .isInt({ min: 1900, max: 2100 })
    .withMessage('Valid graduation year is required'),
  body('academicData.overallCGPA')
    .isFloat({ min: 0, max: 10 })
    .withMessage('Valid CGPA is required (0-10)'),
  body('academicData.overallPercentage')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Valid percentage is required (0-100)'),
  body('academicData.classification')
    .notEmpty()
    .trim()
    .withMessage('Classification is required'),
  
  // Optional arrays
  body('academicData.semesters')
    .optional()
    .isArray()
    .withMessage('Semesters must be an array'),
  body('academicData.technicalSkills')
    .optional()
    .isArray()
    .withMessage('Technical skills must be an array'),
  body('academicData.softSkills')
    .optional()
    .isArray()
    .withMessage('Soft skills must be an array')
];

// Certificate ID validation
const certificateIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid certificate ID format')
];

// Pagination validation
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['PENDING', 'MINTED', 'VERIFIED', 'REVOKED'])
    .withMessage('Invalid status filter')
];

// Revocation validation
const revokeCertificateValidation = [
  body('reason')
    .notEmpty()
    .trim()
    .withMessage('Revocation reason is required')
];

// Routes

// Issue new certificate (Admin only)
router.post('/issue',
  authMiddleware.requireAuth(),
  roleMiddleware.requireAdmin(),
  roleMiddleware.requireCollegeAssociation(),
  issueCertificateValidation,
  validateRequest,
  certificateController.issueCertificate
);

// Get user's certificates (Admin only)
router.get('/my-certificates',
  authMiddleware.requireAuth(),
  roleMiddleware.requireAdmin(),
  certificateController.getMyCertificates
);

// Get certificate by ID (public access)
router.get('/:id',
  certificateIdValidation,
  validateRequest,
  certificateController.getCertificateById
);

// Get certificate by API code (public access for students)
router.get('/api-code/:code',
  param('code')
    .matches(/^CERT-[A-Z0-9-]+$/)
    .withMessage('Invalid API code format'),
  validateRequest,
  certificateController.getCertificateByApiCode
);

// Get college certificates (Admin only)
router.get('/college/all',
  authMiddleware.requireAuth(),
  roleMiddleware.requireAdmin(),
  roleMiddleware.requireCollegeAssociation(),
  paginationValidation,
  validateRequest,
  certificateController.getCollegeCertificates
);

// Revoke certificate (Admin only)
router.put('/:id/revoke',
  authMiddleware.requireAuth(),
  roleMiddleware.requireAdmin(),
  certificateIdValidation,
  revokeCertificateValidation,
  validateRequest,
  certificateController.revokeCertificate
);

// Batch operations (Admin only)
router.post('/batch/issue',
  authMiddleware.requireAuth(),
  roleMiddleware.requireAdmin(),
  roleMiddleware.requireCollegeAssociation(),
  body('certificates').isArray({ min: 1, max: 50 }).withMessage('Certificates array required (max 50)'),
  body('certificates.*.studentEmail').isEmail().withMessage('Valid student email required'),
  body('certificates.*.certificateData.degree').notEmpty().withMessage('Degree required'),
  body('certificates.*.certificateData.institution').notEmpty().withMessage('Institution required'),
  body('certificates.*.certificateData.year').isInt({ min: 1900, max: 2100 }).withMessage('Valid year required'),
  validateRequest,
  async (req, res) => {
    try {
      const results = [];
      const { certificates } = req.body;

      for (const certData of certificates) {
        try {
          req.body = certData;
          await certificateController.issueCertificate(req, {
            status: () => ({ json: (data) => results.push({ success: true, data }) }),
            json: (data) => results.push({ success: true, data })
          });
        } catch (error) {
          results.push({ 
            success: false, 
            error: error.message,
            studentEmail: certData.studentEmail 
          });
        }
      }

      res.json({
        success: true,
        message: 'Batch processing completed',
        data: { results }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Batch processing failed',
        error: error.message
      });
    }
  }
);

module.exports = router;