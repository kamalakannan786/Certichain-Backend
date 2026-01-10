module.exports = {
  apps: [{
    name: 'certichain-api',
    script: 'app.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Performance optimizations
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto restart settings
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Health monitoring
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true,
    
    // Advanced settings
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Environment variables for production
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Database settings
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/certichain',
      REDIS_URL: process.env.REDIS_URL,
      
      // Security settings
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: '7d',
      
      // Rate limiting
      RATE_LIMIT_WINDOW_MS: 900000,
      RATE_LIMIT_MAX_REQUESTS: 100,
      
      // CORS settings
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://certichain.com',
      
      // Blockchain settings
      BLOCKCHAIN_RPC_URL: process.env.BLOCKCHAIN_RPC_URL,
      CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
      
      // AWS settings (if used)
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: process.env.AWS_REGION || 'us-east-1'
    }
  }]
};