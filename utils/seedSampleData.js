const mongoose = require('mongoose');
const User = require('../models/User.model');
const College = require('../models/College.model');
const Certificate = require('../models/Certificate.model');
require('dotenv').config();

async function seedSampleData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/certichain');
    console.log('Connected to MongoDB');

    // Sample Users
    const sampleUsers = [
      {
        email: 'admin@mit.edu',
        password: 'password123',
        role: 'ADMIN',
        profile: {
          firstName: 'John',
          lastName: 'Smith',
          phone: '+1-617-555-0101'
        },
        collegeCode: 'MIT'
      },
      {
        email: 'admin@test.edu',
        password: 'password123',
        role: 'ADMIN',
        profile: {
          firstName: 'Sarah',
          lastName: 'Johnson',
          phone: '+1-555-555-0102'
        },
        collegeCode: 'TEST'
      },
      {
        email: 'hr@techcorp.com',
        password: 'password123',
        role: 'VERIFIER',
        profile: {
          firstName: 'Michael',
          lastName: 'Brown',
          phone: '+1-555-555-0201',
          companyName: 'TechCorp Inc.'
        }
      },
      {
        email: 'recruiter@innovate.com',
        password: 'password123',
        role: 'VERIFIER',
        profile: {
          firstName: 'Emily',
          lastName: 'Davis',
          phone: '+1-555-555-0202',
          companyName: 'Innovate Solutions'
        }
      }
    ];

    // Create users
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        let college = null;
        if (userData.collegeCode) {
          college = await College.findOne({ code: userData.collegeCode });
        }

        const user = new User({
          email: userData.email,
          password: userData.password,
          role: userData.role,
          profile: userData.profile,
          college: college?._id
        });

        await user.save();
        console.log(`Created user: ${userData.email}`);
      } else {
        console.log(`User already exists: ${userData.email}`);
      }
    }

    // Sample Certificates
    const mitCollege = await College.findOne({ code: 'MIT' });
    const testCollege = await College.findOne({ code: 'TEST' });
    const mitAdmin = await User.findOne({ email: 'admin@mit.edu' });
    const testAdmin = await User.findOne({ email: 'admin@test.edu' });

    const sampleCertificates = [
      {
        studentData: {
          name: 'Alice Johnson',
          email: 'alice.johnson@student.mit.edu',
          phone: '+1-555-0001',
          studentId: 'MIT2024001',
          dateOfBirth: '1999-05-15',
          address: {
            street: '123 Student Ave',
            city: 'Cambridge',
            state: 'MA',
            country: 'USA',
            zipCode: '02139'
          }
        },
        academicData: {
          degree: 'Bachelor of Science in Computer Science',
          specialization: 'Artificial Intelligence',
          duration: '4 years',
          admissionYear: 2020,
          graduationYear: 2024,
          overallCGPA: 9.2,
          overallPercentage: 92.0,
          classification: 'First Class with Distinction',
          technicalSkills: ['Python', 'Machine Learning', 'React', 'Node.js', 'MongoDB'],
          softSkills: ['Leadership', 'Communication', 'Problem Solving', 'Teamwork'],
          achievements: [
            {
              title: 'Dean\'s List',
              category: 'Academic',
              description: 'Maintained GPA above 9.0 for all semesters',
              date: '2024-05-15'
            },
            {
              title: 'Best Project Award',
              category: 'Technical',
              description: 'AI-powered healthcare diagnosis system',
              date: '2024-04-20'
            }
          ],
          thesis: {
            title: 'Deep Learning Applications in Medical Diagnosis',
            guide: 'Dr. Robert Chen',
            abstract: 'This thesis explores the application of deep learning techniques in medical diagnosis, focusing on image recognition for early disease detection.',
            grade: 'A+'
          },
          attendance: {
            overall: 96,
            remarks: 'Excellent attendance record'
          },
          disciplinaryRecord: {
            clean: true,
            remarks: ''
          }
        },
        college: mitCollege._id,
        issuedBy: mitAdmin._id,
        status: 'MINTED',
        apiCode: 'MIT-2024-001-ABC123',
        blockchain: {
          certificateHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
          blockNumber: 12345678
        }
      },
      {
        studentData: {
          name: 'Bob Wilson',
          email: 'bob.wilson@student.test.edu',
          phone: '+1-555-0002',
          studentId: 'TEST2024002',
          dateOfBirth: '1998-08-22',
          address: {
            street: '456 College Rd',
            city: 'Test City',
            state: 'Test State',
            country: 'USA',
            zipCode: '12345'
          }
        },
        academicData: {
          degree: 'Master of Business Administration',
          specialization: 'Finance',
          duration: '2 years',
          admissionYear: 2022,
          graduationYear: 2024,
          overallCGPA: 8.7,
          overallPercentage: 87.0,
          classification: 'First Class',
          technicalSkills: ['Financial Modeling', 'Excel', 'SQL', 'Tableau', 'Python'],
          softSkills: ['Strategic Thinking', 'Leadership', 'Negotiation', 'Presentation'],
          achievements: [
            {
              title: 'Outstanding Student Award',
              category: 'Academic',
              description: 'Top 5% of graduating class',
              date: '2024-06-01'
            }
          ],
          thesis: {
            title: 'Blockchain Technology in Financial Services',
            guide: 'Prof. Lisa Anderson',
            abstract: 'Analysis of blockchain adoption in traditional banking and its impact on financial services.',
            grade: 'A'
          },
          attendance: {
            overall: 94,
            remarks: 'Good attendance'
          },
          disciplinaryRecord: {
            clean: true,
            remarks: ''
          }
        },
        college: testCollege._id,
        issuedBy: testAdmin._id,
        status: 'MINTED',
        apiCode: 'TEST-2024-002-XYZ789',
        blockchain: {
          certificateHash: 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123457',
          transactionHash: '0x2345678901bcdef2345678901bcdef23456789',
          blockNumber: 12345679
        }
      },
      {
        studentData: {
          name: 'Carol Martinez',
          email: 'carol.martinez@student.mit.edu',
          phone: '+1-555-0003',
          studentId: 'MIT2024003',
          dateOfBirth: '2000-12-10',
          address: {
            street: '789 Innovation St',
            city: 'Cambridge',
            state: 'MA',
            country: 'USA',
            zipCode: '02139'
          }
        },
        academicData: {
          degree: 'Bachelor of Science in Electrical Engineering',
          specialization: 'Robotics',
          duration: '4 years',
          admissionYear: 2020,
          graduationYear: 2024,
          overallCGPA: 8.9,
          overallPercentage: 89.0,
          classification: 'First Class',
          technicalSkills: ['C++', 'MATLAB', 'ROS', 'Circuit Design', 'Embedded Systems'],
          softSkills: ['Innovation', 'Critical Thinking', 'Project Management'],
          achievements: [
            {
              title: 'Robotics Competition Winner',
              category: 'Technical',
              description: 'First place in MIT Robotics Challenge 2024',
              date: '2024-03-15'
            }
          ],
          thesis: {
            title: 'Autonomous Navigation Systems for Mobile Robots',
            guide: 'Dr. James Park',
            abstract: 'Development of advanced navigation algorithms for autonomous mobile robots in complex environments.',
            grade: 'A'
          },
          attendance: {
            overall: 91,
            remarks: 'Good attendance with some lab absences'
          },
          disciplinaryRecord: {
            clean: true,
            remarks: ''
          }
        },
        college: mitCollege._id,
        issuedBy: mitAdmin._id,
        status: 'MINTED',
        apiCode: 'MIT-2024-003-DEF456',
        blockchain: {
          certificateHash: 'c3d4e5f6789012345678901234567890abcdef1234567890abcdef123458',
          transactionHash: '0x3456789012cdef3456789012cdef34567890',
          blockNumber: 12345680
        }
      }
    ];

    // Create certificates
    for (const certData of sampleCertificates) {
      const existingCert = await Certificate.findOne({ apiCode: certData.apiCode });
      if (!existingCert) {
        const certificate = new Certificate(certData);
        await certificate.save();
        console.log(`Created certificate for: ${certData.studentData.name}`);
      } else {
        console.log(`Certificate already exists for: ${certData.studentData.name}`);
      }
    }

    console.log('\n=== Sample Data Created Successfully! ===');
    console.log('\nTest Accounts:');
    console.log('College Admins:');
    console.log('- admin@mit.edu / password123 (MIT)');
    console.log('- admin@test.edu / password123 (TEST)');
    console.log('\nCompany Verifiers:');
    console.log('- hr@techcorp.com / password123 (TechCorp Inc.)');
    console.log('- recruiter@innovate.com / password123 (Innovate Solutions)');
    console.log('\nStudent API Codes for Testing:');
    console.log('- MIT-2024-001-ABC123 (Alice Johnson - CS)');
    console.log('- TEST-2024-002-XYZ789 (Bob Wilson - MBA)');
    console.log('- MIT-2024-003-DEF456 (Carol Martinez - EE)');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding sample data:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedSampleData();
}

module.exports = seedSampleData;