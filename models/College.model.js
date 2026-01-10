const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  address: {
    street: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: String
  },
  contact: {
    email: { type: String, required: true },
    phone: String,
    website: String
  },
  accreditation: {
    body: String,
    number: String,
    validUntil: Date
  },
  blockchain: {
    walletAddress: String,
    isAuthorized: { type: Boolean, default: false }
  },
  settings: {
    certificateTemplate: String,
    logoUrl: String,
    signatureUrl: String,
    autoApprove: { type: Boolean, default: false }
  },
  statistics: {
    totalCertificates: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    totalVerifications: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Update statistics
collegeSchema.methods.updateStats = async function() {
  const Certificate = require('./Certificate.model');
  const User = require('./User.model');
  
  const [certificates, students] = await Promise.all([
    Certificate.countDocuments({ college: this._id }),
    User.countDocuments({ college: this._id, role: 'STUDENT' })
  ]);
  
  this.statistics.totalCertificates = certificates;
  this.statistics.totalStudents = students;
  
  return this.save();
};

module.exports = mongoose.model('College', collegeSchema);