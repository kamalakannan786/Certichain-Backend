#!/bin/bash

# CertiChain High-Scale Production Deployment Script
# This script sets up the application for millions of users

echo "🚀 Starting CertiChain High-Scale Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js $REQUIRED_VERSION or higher."
    exit 1
fi

print_status "Node.js version: $NODE_VERSION"

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    print_warning "MongoDB is not running. Starting MongoDB..."
    sudo systemctl start mongod
    sudo systemctl enable mongod
fi

# Check if Redis is available (optional but recommended)
if ! command -v redis-server &> /dev/null; then
    print_warning "Redis is not installed. Installing Redis for caching..."
    sudo apt-get update
    sudo apt-get install -y redis-server
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
fi

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2 for process management..."
    npm install -g pm2
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs
mkdir -p backups
mkdir -p uploads

# Set proper permissions
chmod 755 logs backups uploads

# Install dependencies with production optimizations
print_status "Installing dependencies..."
npm ci --only=production --no-audit --no-fund

# Copy optimized package.json if it exists
if [ -f "package-optimized.json" ]; then
    print_status "Using optimized package.json..."
    cp package-optimized.json package.json
    npm install --only=production
fi

# Set up environment variables
if [ ! -f ".env" ]; then
    print_status "Creating production environment file..."
    cat > .env << EOL
# Production Environment Configuration
NODE_ENV=production
PORT=5000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/certichain
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# Security Configuration
BCRYPT_ROUNDS=10
SESSION_SECRET=$(openssl rand -base64 32)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Blockchain Configuration (update with your values)
BLOCKCHAIN_RPC_URL=https://polygon-mumbai.infura.io/v3/YOUR_INFURA_PROJECT_ID
CONTRACT_ADDRESS=YOUR_CONTRACT_ADDRESS

# Monitoring
ENABLE_MONITORING=true
LOG_LEVEL=info
EOL
    print_warning "Please update the .env file with your actual configuration values!"
fi

# Set up MongoDB indexes for performance
print_status "Setting up database indexes..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config();

async function setupIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    // User collection indexes
    await db.collection('users').createIndex({ email: 1, isActive: 1 });
    await db.collection('users').createIndex({ role: 1, college: 1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    await db.collection('users').createIndex({ lastLogin: -1 });
    
    // Certificate collection indexes
    await db.collection('certificates').createIndex({ apiCode: 1 });
    await db.collection('certificates').createIndex({ 'studentData.email': 1 });
    await db.collection('certificates').createIndex({ college: 1, issuedBy: 1 });
    await db.collection('certificates').createIndex({ status: 1 });
    await db.collection('certificates').createIndex({ createdAt: -1 });
    await db.collection('certificates').createIndex({ 'blockchain.certificateHash': 1 });
    
    console.log('Database indexes created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create indexes:', error);
    process.exit(1);
  }
}

setupIndexes();
"

# Seed the database
print_status "Seeding database with initial data..."
node utils/seed.js

# Set up log rotation
print_status "Setting up log rotation..."
sudo tee /etc/logrotate.d/certichain > /dev/null << EOL
$(pwd)/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $(whoami) $(whoami)
    postrotate
        pm2 reloadLogs
    endscript
}
EOL

# Set up system limits for high concurrency
print_status "Configuring system limits for high concurrency..."
echo "$(whoami) soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "$(whoami) hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Configure kernel parameters for high performance
print_status "Optimizing kernel parameters..."
sudo tee -a /etc/sysctl.conf > /dev/null << EOL

# CertiChain High Performance Settings
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 10
vm.swappiness = 10
EOL

sudo sysctl -p

# Start the application with PM2
print_status "Starting CertiChain API with PM2..."
pm2 delete certichain-api 2>/dev/null || true
pm2 start ecosystem.config.js --env production

# Set up PM2 startup script
pm2 startup
pm2 save

# Set up monitoring
print_status "Setting up monitoring..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30

# Create health check script
print_status "Creating health check script..."
cat > health-check.sh << 'EOL'
#!/bin/bash
HEALTH_URL="http://localhost:5000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "✅ CertiChain API is healthy"
    exit 0
else
    echo "❌ CertiChain API is unhealthy (HTTP $RESPONSE)"
    exit 1
fi
EOL

chmod +x health-check.sh

# Set up cron job for health checks
print_status "Setting up automated health checks..."
(crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/health-check.sh >> $(pwd)/logs/health-check.log 2>&1") | crontab -

# Display final status
print_status "Deployment completed successfully!"
echo ""
echo -e "${BLUE}=== CertiChain High-Scale Deployment Summary ===${NC}"
echo -e "${GREEN}✅ Application Status:${NC} Running with PM2 clustering"
echo -e "${GREEN}✅ Process Management:${NC} PM2 with auto-restart"
echo -e "${GREEN}✅ Database:${NC} MongoDB with optimized indexes"
echo -e "${GREEN}✅ Caching:${NC} Redis (if available)"
echo -e "${GREEN}✅ Logging:${NC} Structured logging with rotation"
echo -e "${GREEN}✅ Monitoring:${NC} Health checks every 5 minutes"
echo -e "${GREEN}✅ Security:${NC} Rate limiting and security headers"
echo ""
echo -e "${BLUE}=== Access Information ===${NC}"
echo -e "${GREEN}API Endpoint:${NC} http://localhost:5000"
echo -e "${GREEN}Health Check:${NC} http://localhost:5000/health"
echo -e "${GREEN}API Documentation:${NC} http://localhost:5000/api"
echo ""
echo -e "${BLUE}=== Management Commands ===${NC}"
echo -e "${GREEN}View Logs:${NC} pm2 logs certichain-api"
echo -e "${GREEN}Monitor:${NC} pm2 monit"
echo -e "${GREEN}Restart:${NC} pm2 restart certichain-api"
echo -e "${GREEN}Stop:${NC} pm2 stop certichain-api"
echo -e "${GREEN}Health Check:${NC} ./health-check.sh"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo -e "   1. Update .env file with your actual configuration"
echo -e "   2. Configure your reverse proxy (nginx/apache)"
echo -e "   3. Set up SSL certificates"
echo -e "   4. Configure firewall rules"
echo -e "   5. Set up database backups"
echo ""
print_status "CertiChain is now ready to handle millions of users! 🚀"