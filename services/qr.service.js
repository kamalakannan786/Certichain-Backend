const QRCode = require('qrcode');
const crypto = require('crypto');

class QRService {
  // Generate QR code for certificate
  async generateQRCode(certificateId, options = {}) {
    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/verify/${certificateId}`;

      const qrOptions = {
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: options.width || 256,
        ...options
      };

      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(verificationUrl, qrOptions);
      
      return qrCodeDataURL; // Return just the data URL string
    } catch (error) {
      console.error('QR code generation failed:', error);
      throw new Error(`QR generation failed: ${error.message}`);
    }
  }

  // Generate QR code with custom data
  async generateCustomQRCode(data, options = {}) {
    try {
      const qrOptions = {
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: options.width || 256,
        ...options
      };

      const qrCodeDataURL = await QRCode.toDataURL(data, qrOptions);
      
      return {
        dataURL: qrCodeDataURL,
        data,
        format: 'png'
      };
    } catch (error) {
      console.error('Custom QR code generation failed:', error);
      throw new Error(`QR generation failed: ${error.message}`);
    }
  }

  // Generate QR code for certificate hash
  async generateHashQRCode(certificateHash, options = {}) {
    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/verify/hash/${certificateHash}`;

      const qrOptions = {
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: options.width || 256,
        ...options
      };

      const qrCodeDataURL = await QRCode.toDataURL(verificationUrl, qrOptions);
      
      return {
        dataURL: qrCodeDataURL,
        verificationUrl,
        hash: certificateHash,
        format: 'png'
      };
    } catch (error) {
      console.error('Hash QR code generation failed:', error);
      throw new Error(`Hash QR generation failed: ${error.message}`);
    }
  }

  // Generate batch QR codes
  async generateBatchQRCodes(certificates, options = {}) {
    try {
      const qrCodes = [];

      for (const certificate of certificates) {
        const qrCode = await this.generateQRCode(certificate._id, options);
        qrCodes.push({
          certificateId: certificate._id,
          studentName: certificate.certificateData.studentName,
          qrCode
        });
      }

      return qrCodes;
    } catch (error) {
      console.error('Batch QR code generation failed:', error);
      throw new Error(`Batch QR generation failed: ${error.message}`);
    }
  }

  // Validate QR code data
  validateQRData(qrData) {
    try {
      // Check if it's a valid certificate ID (MongoDB ObjectId)
      if (qrData.match(/^[0-9a-fA-F]{24}$/)) {
        return {
          type: 'certificateId',
          value: qrData,
          isValid: true
        };
      }

      // Check if it's a valid hash (64 character hex string)
      if (qrData.match(/^[a-fA-F0-9]{64}$/)) {
        return {
          type: 'certificateHash',
          value: qrData,
          isValid: true
        };
      }

      // Check if it's a verification URL
      const urlPattern = /\/verify\/([a-fA-F0-9]{24}|hash\/[a-fA-F0-9]{64})$/;
      const urlMatch = qrData.match(urlPattern);
      if (urlMatch) {
        const path = urlMatch[1];
        if (path.startsWith('hash/')) {
          return {
            type: 'certificateHash',
            value: path.substring(5),
            isValid: true
          };
        } else {
          return {
            type: 'certificateId',
            value: path,
            isValid: true
          };
        }
      }

      return {
        type: 'unknown',
        value: qrData,
        isValid: false
      };
    } catch (error) {
      return {
        type: 'invalid',
        value: qrData,
        isValid: false,
        error: error.message
      };
    }
  }

  // Generate secure verification token
  generateVerificationToken(certificateId) {
    const timestamp = Date.now();
    const data = `${certificateId}-${timestamp}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    return {
      token: hash,
      timestamp,
      expiresAt: timestamp + (24 * 60 * 60 * 1000) // 24 hours
    };
  }
}

module.exports = new QRService();