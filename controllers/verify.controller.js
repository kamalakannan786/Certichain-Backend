const Certificate = require('../models/Certificate.model');
const blockchainService = require('../services/blockchain.service');

class VerifyController {
  async verifyCertificateById(req, res) {
    try {
      const { id } = req.params;

      const certificate = await Certificate.findById(id)
        .populate('college', 'name code address')
        .populate('issuedBy', 'profile');

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
          isValid: false
        });
      }

      let blockchainVerification = null;

      if (certificate.tokenId) {
        try {
          blockchainVerification = await blockchainService.verifyCertificate(certificate.tokenId);
        } catch (error) {
          console.error('Blockchain verification failed:', error);
        }
      }

      await certificate.recordVerification();

      const isValid = certificate.status === 'MINTED' &&
        (!blockchainVerification || blockchainVerification.isValid);

      res.json({
        success: true,
        isValid,
        data: {
          certificate: {
            id: certificate._id,
            studentData: certificate.studentData,
            academicData: certificate.academicData,
            tokenId: certificate.tokenId,
            issuedAt: certificate.issuedAt,
            status: certificate.status,
            blockchain: {
              certificateHash: certificate.blockchain?.certificateHash,
              transactionHash: certificate.blockchain?.transactionHash,
              blockNumber: certificate.blockchain?.blockNumber
            },
            metadata: certificate.metadata
          },
          college: certificate.college,
          blockchainVerification: blockchainVerification,
          verificationCount: certificate.verificationCount,
          lastVerified: certificate.lastVerified
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Verification failed',
        error: error.message,
        isValid: false
      });
    }
  }

  async verifyCertificateByHash(req, res) {
    try {
      const { hash } = req.params;

      const certificate = await Certificate.findOne({
        'blockchain.certificateHash': hash
      })
        .populate('college', 'name code address');

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
          isValid: false
        });
      }

      let blockchainVerification = null;
      try {
        blockchainVerification = await blockchainService.verifyCertificateByHash(hash);
      } catch (error) {
        console.error('Blockchain verification failed:', error);
      }

      await certificate.recordVerification();

      const isValid = certificate.status === 'MINTED' &&
        (!blockchainVerification || blockchainVerification.isValid);

      res.json({
        success: true,
        isValid,
        data: {
          certificate: {
            id: certificate._id,
            studentData: certificate.studentData,
            academicData: certificate.academicData,
            tokenId: certificate.tokenId,
            issuedAt: certificate.issuedAt,
            status: certificate.status,
            blockchain: {
              certificateHash: certificate.blockchain?.certificateHash,
              transactionHash: certificate.blockchain?.transactionHash,
              blockNumber: certificate.blockchain?.blockNumber
            },
            metadata: certificate.metadata
          },
          college: certificate.college,
          blockchainVerification: blockchainVerification,
          verificationCount: certificate.verificationCount
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Verification failed',
        error: error.message,
        isValid: false
      });
    }
  }

  async verifyByQRCode(req, res) {
    try {
      const { qrData } = req.body;

      let certificate = null;

      if (qrData.match(/^[0-9a-fA-F]{24}$/)) {
        certificate = await Certificate.findById(qrData)
          .populate('college', 'name code address');
      }

      if (!certificate) {
        certificate = await Certificate.findOne({
          'blockchain.certificateHash': qrData
        })
          .populate('college', 'name code address');
      }

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Invalid QR code or certificate not found',
          isValid: false
        });
      }

      let blockchainVerification = null;
      if (certificate.tokenId) {
        try {
          blockchainVerification = await blockchainService.verifyCertificate(certificate.tokenId);
        } catch (error) {
          console.error('Blockchain verification failed:', error);
        }
      }

      await certificate.recordVerification();

      const isValid = certificate.status === 'MINTED' &&
        (!blockchainVerification || blockchainVerification.isValid);

      res.json({
        success: true,
        isValid,
        data: {
          certificate: {
            id: certificate._id,
            studentData: certificate.studentData,
            academicData: certificate.academicData,
            tokenId: certificate.tokenId,
            issuedAt: certificate.issuedAt,
            status: certificate.status,
            blockchain: {
              certificateHash: certificate.blockchain?.certificateHash,
              transactionHash: certificate.blockchain?.transactionHash,
              blockNumber: certificate.blockchain?.blockNumber
            },
            metadata: certificate.metadata
          },
          college: certificate.college,
          blockchainVerification: blockchainVerification,
          verificationCount: certificate.verificationCount
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'QR verification failed',
        error: error.message,
        isValid: false
      });
    }
  }

  async getVerificationStats(req, res) {
    try {
      const stats = await Certificate.aggregate([
        {
          $group: {
            _id: null,
            totalCertificates: { $sum: 1 },
            totalVerifications: { $sum: '$verificationCount' },
            validCertificates: {
              $sum: {
                $cond: [{ $eq: ['$status', 'MINTED'] }, 1, 0]
              }
            },
            revokedCertificates: {
              $sum: {
                $cond: [{ $eq: ['$status', 'REVOKED'] }, 1, 0]
              }
            }
          }
        }
      ]);

      const result = stats[0] || {
        totalCertificates: 0,
        totalVerifications: 0,
        validCertificates: 0,
        revokedCertificates: 0
      };

      res.json({
        success: true,
        data: { stats: result }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch verification statistics',
        error: error.message
      });
    }
  }
}

module.exports = new VerifyController();