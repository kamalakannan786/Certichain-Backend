const mongoose = require('mongoose');
const College = require('../models/College.model');
require('dotenv').config();

async function seedColleges() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/certichain');
    
    const colleges = [
      {
        name: 'Massachusetts Institute of Technology',
        code: 'MIT',
        address: {
          street: '77 Massachusetts Avenue',
          city: 'Cambridge',
          state: 'Massachusetts',
          country: 'USA',
          zipCode: '02139'
        },
        contact: {
          email: 'admin@mit.edu',
          phone: '+1-617-253-1000',
          website: 'https://web.mit.edu'
        },
        isActive: true
      },
      {
        name: 'Test University',
        code: 'TEST',
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          country: 'Test Country',
          zipCode: '12345'
        },
        contact: {
          email: 'admin@test.edu',
          phone: '+1-555-0123',
          website: 'https://www.test.edu'
        },
        isActive: true
      }
    ];

    for (const collegeData of colleges) {
      const existingCollege = await College.findOne({ code: collegeData.code });
      if (!existingCollege) {
        const college = new College(collegeData);
        await college.save();
        console.log(`Created college: ${collegeData.name} (${collegeData.code})`);
      } else {
        console.log(`College already exists: ${collegeData.name} (${collegeData.code})`);
      }
    }

    console.log('College seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding colleges:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedColleges();
}

module.exports = seedColleges;