const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User.model');
const College = require('../models/College.model');

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await College.deleteMany({});

    // Create sample college
    const college = new College({
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
      blockchain: {
        isAuthorized: true
      },
      isActive: true
    });
    await college.save();

    // Create admin user
    const adminUser = new User({
      email: 'admin@mit.edu',
      password: 'password123',
      role: 'ADMIN',
      profile: {
        firstName: 'John',
        lastName: 'Admin'
      },
      college: college._id,
      isActive: true
    });
    await adminUser.save();

    // Create verifier user
    const verifierUser = new User({
      email: 'verifier@company.com',
      password: 'password123',
      role: 'VERIFIER',
      profile: {
        firstName: 'Bob',
        lastName: 'Verifier'
      },
      isActive: true
    });
    await verifierUser.save();

    console.log('Database seeded successfully!');
    console.log('Demo accounts created:');
    console.log('College Admin: admin@mit.edu / password123');
    console.log('Verifier: verifier@company.com / password123');
    console.log('Note: Students do not need accounts - they receive certificates via API/QR codes');

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDatabase();