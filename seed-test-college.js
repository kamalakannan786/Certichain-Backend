#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const College = require('./models/College.model');

async function seedTestCollege() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/certichain');
        console.log('✓ Connected to MongoDB');

        // Check if TEST01 college exists
        let college = await College.findOne({ code: 'TEST01' });

        if (college) {
            console.log('✓ Test college already exists:', college.name);
        } else {
            // Create test college
            college = await College.create({
                name: 'Test University',
                code: 'TEST01',
                address: {
                    street: '123 Test Street',
                    city: 'Test City',
                    state: 'Test State',
                    country: 'Test Country',
                    zipCode: '12345'
                },
                contact: {
                    email: 'admin@testuniversity.edu',
                    phone: '+1234567890',
                    website: 'https://testuniversity.edu'
                },
                isActive: true
            });

            console.log('✓ Created test college:', college.name);
        }

        console.log('\nCollege Details:');
        console.log('  Code:', college.code);
        console.log('  Name:', college.name);
        console.log('  ID:', college._id);

        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

seedTestCollege();
