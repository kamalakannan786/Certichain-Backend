const Certificate = require('../models/Certificate.model');
const User = require('../models/User.model');
const College = require('../models/College.model');
const blockchainService = require('../services/blockchain.service');
const qrService = require('../services/qr.service');

class CertificateController {
  // Issue new certificate (Admin only)
  async issueCertificate(req, res) {
    try {
      const { studentData, academicData } = req.body;
      const issuerId = req.user.id;

      // Get issuer's college
      const issuer = await User.findById(issuerId).populate('college');
      if (!issuer.college) {
        return res.status(400).json({
          success: false,
          message: 'Issuer must be associated with a college'
        });
      }

      // Create certificate with comprehensive student data
      const certificate = new Certificate({
        studentData: {
          name: studentData.name,
          email: studentData.email,
          phone: studentData.phone,
          studentId: studentData.studentId,
          dateOfBirth: studentData.dateOfBirth,
          address: studentData.address
        },
        college: issuer.college._id,
        academicData: {
          degree: academicData.degree,
          specialization: academicData.specialization,
          duration: academicData.duration,
          admissionYear: academicData.admissionYear,
          graduationYear: academicData.graduationYear,
          overallCGPA: academicData.overallCGPA,
          overallPercentage: academicData.overallPercentage,
          classification: academicData.classification,
          semesters: academicData.semesters || [],
          technicalSkills: academicData.technicalSkills || [],
          softSkills: academicData.softSkills || [],
          certifications: academicData.certifications || [],
          projects: academicData.projects || [],
          internships: academicData.internships || [],
          achievements: academicData.achievements || [],
          thesis: academicData.thesis,
          attendance: academicData.attendance,
          disciplinaryRecord: academicData.disciplinaryRecord || { clean: true }
        },
        issuedBy: issuerId
      });

      // Generate certificate hash
      certificate.blockchain.certificateHash = certificate.generateHash();

      // Generate unique API code for student access
      certificate.apiCode = certificate.generateApiCode();

      // Save certificate
      await certificate.save();

      // Generate QR code with verification link
      const verificationLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify/${certificate._id}`;
      const qrCode = await qrService.generateQRCode(verificationLink);
      certificate.metadata.qrCode = qrCode;
      certificate.metadata.verificationLink = verificationLink;
      await certificate.save();

      // Mint NFT on blockchain
      try {
        const mintResult = await blockchainService.mintCertificate(
          issuer.college.blockchain.walletAddress,
          certificate.academicData,
          certificate.blockchain.certificateHash
        );

        certificate.tokenId = mintResult.tokenId;
        certificate.blockchain.transactionHash = mintResult.transactionHash;
        certificate.blockchain.blockNumber = mintResult.blockNumber;
        certificate.status = 'MINTED';
        await certificate.save();

        res.status(201).json({
          success: true,
          message: 'Certificate issued successfully with complete academic record',
          data: {
            certificate: await certificate.populate(['college', 'issuedBy']),
            studentAccess: {
              apiCode: certificate.apiCode,
              verificationLink: verificationLink,
              qrCode: qrCode
            }
          }
        });
      } catch (blockchainError) {
        certificate.status = 'PENDING';
        await certificate.save();
        
        res.status(201).json({
          success: true,
          message: 'Certificate created with complete academic record, blockchain minting pending',
          data: {
            certificate,
            studentAccess: {
              apiCode: certificate.apiCode,
              verificationLink: verificationLink,
              qrCode: qrCode
            }
          },
          warning: 'Blockchain minting failed, will retry automatically'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Certificate issuance failed',
        error: error.message
      });
    }
  }

  // Get certificates for current user (Admin only)
  async getMyCertificates(req, res) {
    try {
      const userId = req.user.id;
      const { role } = req.user;

      if (role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only college admins can view certificates'
        });
      }

      // Get certificates issued by this admin
      const certificates = await Certificate.find({ issuedBy: userId })
        .populate('college', 'name code')
        .populate('issuedBy', 'profile email')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: { certificates }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch certificates',
        error: error.message
      });
    }
  }

  // Get certificate by ID (public access for verification)
  async getCertificateById(req, res) {
    try {
      const { id } = req.params;

      const certificate = await Certificate.findById(id)
        .populate('college', 'name code address contact')
        .populate('issuedBy', 'profile email');

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      // Allow access for admins, verifiers, or public verification
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const hasAccess = 
        !req.user || // Public access for verification
        certificate.issuedBy._id.toString() === userId ||
        userRole === 'VERIFIER' ||
        userRole === 'ADMIN';

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: { certificate }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch certificate',
        error: error.message
      });
    }
  }

  // Get certificate by API code (public access for students)
  async getCertificateByApiCode(req, res) {
    try {
      const { code } = req.params;

      const certificate = await Certificate.findOne({ apiCode: code })
        .populate('college', 'name code address contact')
        .populate('issuedBy', 'profile email');

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found with this API code'
        });
      }

      // Record verification
      await certificate.recordVerification();

      res.json({
        success: true,
        data: { certificate }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch certificate',
        error: error.message
      });
    }
  }

  // Get college certificates (ADMIN only)
  async getCollegeCertificates(req, res) {
    try {
      const user = await User.findById(req.user.id).populate('college');
      if (!user.college) {
        return res.status(400).json({
          success: false,
          message: 'User not associated with any college'
        });
      }

      const { page = 1, limit = 10, status } = req.query;
      const query = { college: user.college._id };
      
      if (status) {
        query.status = status;
      }

      const certificates = await Certificate.find(query)
        .populate('student', 'profile email')
        .populate('issuedBy', 'profile email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Certificate.countDocuments(query);

      res.json({
        success: true,
        data: {
          certificates,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch college certificates',
        error: error.message
      });
    }
  }

  // Revoke certificate (ADMIN only)
  async revokeCertificate(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const certificate = await Certificate.findById(id);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      // Revoke on blockchain if minted
      if (certificate.tokenId) {
        await blockchainService.revokeCertificate(certificate.tokenId);
      }

      certificate.status = 'REVOKED';
      certificate.metadata.revocationReason = reason;
      await certificate.save();

      res.json({
        success: true,
        message: 'Certificate revoked successfully',
        data: { certificate }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Certificate revocation failed',
        error: error.message
      });
    }
  }
}

module.exports = new CertificateController();