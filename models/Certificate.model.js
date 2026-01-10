const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  tokenId: {
    type: Number,
    unique: true,
    sparse: true
  },
  // Student personal data (no user account needed)
  studentData: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    studentId: { type: String, required: true },
    dateOfBirth: Date,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: true
  },
  // Comprehensive academic data
  academicData: {
    degree: { type: String, required: true },
    specialization: String,
    duration: { type: String, required: true }, // e.g., "4 years", "2 years"
    admissionYear: { type: Number, required: true },
    graduationYear: { type: Number, required: true },
    overallCGPA: { type: Number, required: true, min: 0, max: 10 },
    overallPercentage: { type: Number, required: true, min: 0, max: 100 },
    classification: { type: String, required: true }, // First Class, Second Class, etc.
    
    // Semester-wise details
    semesters: [{
      semesterNumber: { type: Number, required: true },
      year: { type: Number, required: true },
      subjects: [{
        subjectCode: String,
        subjectName: { type: String, required: true },
        credits: { type: Number, required: true },
        grade: { type: String, required: true }, // A+, A, B+, etc.
        marks: {
          obtained: { type: Number, required: true },
          total: { type: Number, required: true }
        }
      }],
      semesterCGPA: { type: Number, required: true },
      semesterPercentage: { type: Number, required: true },
      result: { type: String, required: true } // Pass, Fail, etc.
    }],
    
    // Skills and achievements
    technicalSkills: [String],
    softSkills: [String],
    certifications: [{
      name: String,
      issuedBy: String,
      dateIssued: Date,
      validUntil: Date
    }],
    projects: [{
      title: String,
      description: String,
      technologies: [String],
      duration: String,
      role: String
    }],
    internships: [{
      company: String,
      position: String,
      duration: String,
      description: String
    }],
    achievements: [{
      title: String,
      description: String,
      date: Date,
      category: String // Academic, Sports, Cultural, etc.
    }],
    
    // Additional academic info
    thesis: {
      title: String,
      guide: String,
      abstract: String,
      grade: String
    },
    attendance: {
      overall: Number, // percentage
      remarks: String
    },
    disciplinaryRecord: {
      clean: { type: Boolean, default: true },
      remarks: String
    }
  },
  
  // Unique API code for student access
  apiCode: {
    type: String,
    unique: true,
    required: true
  },
  blockchain: {
    certificateHash: { type: String, unique: true, required: true },
    transactionHash: String,
    blockNumber: Number,
    walletAddress: String,
    contractAddress: String
  },
  metadata: {
    ipfsHash: String,
    qrCode: String,
    verificationLink: String,
    templateUsed: String,
    revocationReason: String
  },
  status: {
    type: String,
    enum: ['PENDING', 'MINTED', 'VERIFIED', 'REVOKED'],
    default: 'PENDING'
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  verificationCount: {
    type: Number,
    default: 0
  },
  lastVerified: Date
}, {
  timestamps: true
});

// Generate certificate hash
certificateSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = `${this.studentData.name}-${this.academicData.degree}-${this.academicData.overallCGPA}-${this.academicData.graduationYear}-${this.issuedAt}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Generate unique API code for student access
certificateSchema.methods.generateApiCode = function() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const collegeCode = this.college?.code || 'CERT';
  const year = new Date().getFullYear();
  return `${collegeCode}-${year}-${timestamp}-${random}`;
};

// Increment verification count
certificateSchema.methods.recordVerification = function() {
  this.verificationCount += 1;
  this.lastVerified = new Date();
  return this.save();
};

// Check if certificate is valid
certificateSchema.virtual('isValid').get(function() {
  return this.status === 'MINTED' || this.status === 'VERIFIED';
});

module.exports = mongoose.model('Certificate', certificateSchema);