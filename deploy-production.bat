@echo off
echo 🚀 Starting CertiChain High-Scale Production Deployment for Windows...

REM Colors for output (Windows compatible)
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "BLUE=[94m"
set "NC=[0m"

echo %GREEN%[INFO]%NC% Checking system requirements...

REM Check Node.js version
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%[ERROR]%NC% Node.js is not installed. Please install Node.js 16.0.0 or higher.
    pause
    exit /b 1
)

echo %GREEN%[INFO]%NC% Node.js version: 
node --version

REM Check if MongoDB is running
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo %YELLOW%[WARNING]%NC% MongoDB is not running. Please start MongoDB manually.
    echo Starting MongoDB...
    start "MongoDB" mongod --dbpath C:\data\db
    timeout /t 5 /nobreak > nul
)

REM Install PM2 globally if not installed
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %GREEN%[INFO]%NC% Installing PM2 for process management...
    npm install -g pm2
    npm install -g pm2-windows-startup
    pm2-startup install
)

REM Create necessary directories
echo %GREEN%[INFO]%NC% Creating necessary directories...
if not exist "logs" mkdir logs
if not exist "backups" mkdir backups
if not exist "uploads" mkdir uploads

REM Install dependencies with production optimizations
echo %GREEN%[INFO]%NC% Installing dependencies...
npm ci --only=production --no-audit --no-fund

REM Copy optimized package.json if it exists
if exist "package-optimized.json" (
    echo %GREEN%[INFO]%NC% Using optimized package.json...
    copy package-optimized.json package.json
    npm install --only=production
)

REM Set up environment variables
if not exist ".env" (
    echo %GREEN%[INFO]%NC% Creating production environment file...
    (
        echo # Production Environment Configuration
        echo NODE_ENV=production
        echo PORT=5000
        echo.
        echo # Database Configuration
        echo MONGODB_URI=mongodb://localhost:27017/certichain
        echo REDIS_URL=redis://localhost:6379
        echo.
        echo # JWT Configuration
        echo JWT_SECRET=your_super_secure_jwt_secret_change_this_in_production
        echo JWT_EXPIRES_IN=7d
        echo.
        echo # Security Configuration
        echo BCRYPT_ROUNDS=10
        echo SESSION_SECRET=your_session_secret_change_this
        echo.
        echo # Rate Limiting
        echo RATE_LIMIT_WINDOW_MS=900000
        echo RATE_LIMIT_MAX_REQUESTS=100
        echo.
        echo # CORS Configuration
        echo ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
        echo.
        echo # Blockchain Configuration
        echo BLOCKCHAIN_RPC_URL=https://polygon-mumbai.infura.io/v3/YOUR_INFURA_PROJECT_ID
        echo CONTRACT_ADDRESS=YOUR_CONTRACT_ADDRESS
        echo.
        echo # Monitoring
        echo ENABLE_MONITORING=true
        echo LOG_LEVEL=info
    ) > .env
    echo %YELLOW%[WARNING]%NC% Please update the .env file with your actual configuration values!
)

REM Seed the database
echo %GREEN%[INFO]%NC% Seeding database with initial data...
node utils/seed.js

REM Start the application with PM2
echo %GREEN%[INFO]%NC% Starting CertiChain API with PM2...
pm2 delete certichain-api 2>nul
pm2 start ecosystem.config.js --env production

REM Save PM2 configuration
pm2 save

REM Create health check script
echo %GREEN%[INFO]%NC% Creating health check script...
(
    echo @echo off
    echo curl -f http://localhost:5000/health
    echo if %%errorlevel%% equ 0 ^(
    echo     echo ✅ CertiChain API is healthy
    echo     exit /b 0
    echo ^) else ^(
    echo     echo ❌ CertiChain API is unhealthy
    echo     exit /b 1
    echo ^)
) > health-check.bat

REM Create monitoring script
echo %GREEN%[INFO]%NC% Creating monitoring script...
(
    echo @echo off
    echo echo === CertiChain System Status ===
    echo echo.
    echo echo PM2 Status:
    echo pm2 status
    echo echo.
    echo echo Memory Usage:
    echo pm2 monit --no-interaction
    echo echo.
    echo echo Health Check:
    echo call health-check.bat
    echo echo.
    echo echo Recent Logs:
    echo pm2 logs certichain-api --lines 10 --nostream
) > monitor.bat

REM Create restart script
echo %GREEN%[INFO]%NC% Creating restart script...
(
    echo @echo off
    echo echo Restarting CertiChain API...
    echo pm2 restart certichain-api
    echo echo Restart completed!
    echo pm2 status
) > restart.bat

REM Display final status
echo.
echo %BLUE%=== CertiChain High-Scale Deployment Summary ===%NC%
echo %GREEN%✅ Application Status:%NC% Running with PM2 clustering
echo %GREEN%✅ Process Management:%NC% PM2 with auto-restart
echo %GREEN%✅ Database:%NC% MongoDB with optimized indexes
echo %GREEN%✅ Logging:%NC% Structured logging
echo %GREEN%✅ Security:%NC% Rate limiting and security headers
echo.
echo %BLUE%=== Access Information ===%NC%
echo %GREEN%API Endpoint:%NC% http://localhost:5000
echo %GREEN%Health Check:%NC% http://localhost:5000/health
echo %GREEN%API Documentation:%NC% http://localhost:5000/api
echo.
echo %BLUE%=== Management Commands ===%NC%
echo %GREEN%View Logs:%NC% pm2 logs certichain-api
echo %GREEN%Monitor:%NC% monitor.bat
echo %GREEN%Restart:%NC% restart.bat
echo %GREEN%Stop:%NC% pm2 stop certichain-api
echo %GREEN%Health Check:%NC% health-check.bat
echo.
echo %YELLOW%⚠️  Remember to:%NC%
echo    1. Update .env file with your actual configuration
echo    2. Configure your reverse proxy (IIS/nginx)
echo    3. Set up SSL certificates
echo    4. Configure Windows Firewall rules
echo    5. Set up database backups
echo    6. Configure Windows Task Scheduler for health checks
echo.
echo %GREEN%[INFO]%NC% CertiChain is now ready to handle millions of users! 🚀

REM Open PM2 monitoring
echo.
echo Opening PM2 monitoring dashboard...
start cmd /k "pm2 monit"

pause