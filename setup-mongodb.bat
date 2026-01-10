@echo off
echo Setting up MongoDB for CertiChain...

REM Check if MongoDB is installed
where mongod >nul 2>nul
if %errorlevel% neq 0 (
    echo MongoDB is not installed or not in PATH
    echo Please install MongoDB Community Server from: https://www.mongodb.com/try/download/community
    echo Or use MongoDB Atlas cloud database
    pause
    exit /b 1
)

REM Create data directory
if not exist "C:\data\db" (
    echo Creating MongoDB data directory...
    mkdir "C:\data\db"
)

REM Start MongoDB service
echo Starting MongoDB service...
net start MongoDB 2>nul
if %errorlevel% neq 0 (
    echo MongoDB service not found, starting manually...
    start "MongoDB" mongod --dbpath "C:\data\db"
    timeout /t 3 >nul
)

REM Test connection
echo Testing MongoDB connection...
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/certichain', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
}).then(() => {
  console.log('✅ MongoDB connection successful');
  process.exit(0);
}).catch(err => {
  console.log('❌ MongoDB connection failed:', err.message);
  console.log('💡 Consider using MongoDB Atlas: https://cloud.mongodb.com');
  process.exit(1);
});
"

if %errorlevel% equ 0 (
    echo ✅ MongoDB setup complete!
    echo You can now start the CertiChain server with: npm start
) else (
    echo ❌ MongoDB setup failed
    echo Alternative: Use MongoDB Atlas cloud database
    echo 1. Go to https://cloud.mongodb.com
    echo 2. Create a free cluster
    echo 3. Get connection string
    echo 4. Update MONGODB_ATLAS_URI in .env file
)

pause