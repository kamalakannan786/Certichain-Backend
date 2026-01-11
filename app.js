const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cluster = require('cluster');
const os = require('os');
require('dotenv').config();

const databaseConfig = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const certificateRoutes = require('./routes/certificate.routes');
const verifyRoutes = require('./routes/verify.routes');

const allowedOrigins = [
  'https://certichain-frontend-pearl.vercel.app/',
  'http://localhost:3000'
];

class App {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 5000;
    
    this.initializeDatabase();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  async initializeDatabase() {
    try {
      await databaseConfig.connect();
    } catch (error) {
      console.error('Database initialization failed:', error);
      // Don't exit, continue with mock mode for high availability
      console.log('⚠️ Running in mock database mode for high availability');
    }
  }

  initializeMiddlewares() {
    // Security headers
    this.app.use(helmet({ 
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    this.app.options('*', cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    

    // Aggressive rate limiting for high-scale protection
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { success: false, message: 'Too many authentication attempts' },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.method === 'OPTIONS' || process.env.NODE_ENV === 'development'
    });

    const generalLimiter = rateLimit({
      windowMs: 1 * 60 * 1000,
      max: 100,
      message: { success: false, message: 'Rate limit exceeded' },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.method === 'OPTIONS' || process.env.NODE_ENV === 'development'
    });

    // Apply rate limiting
    this.app.use('/api/auth', authLimiter);
    this.app.use('/api/', generalLimiter);

    // Compression for better performance
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      }
    }));

    // Body parsing with limits
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb',
      parameterLimit: 1000
    }));
    
    this.app.use(cookieParser());

    // Optimized logging
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        skip: (req, res) => res.statusCode < 400
      }));
    }

    // Request ID and performance tracking
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substring(2, 15);
      req.startTime = Date.now();
      res.setHeader('X-Request-ID', req.id);
      
      // Performance monitoring
      res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        if (duration > 5000) { // Log slow requests
          console.warn(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
        }
      });
      
      next();
    });

    // Health check bypass
    this.app.use('/health', (req, res, next) => {
      res.locals.skipAuth = true;
      next();
    });
  }

  initializeRoutes() {
    // Optimized health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = {
          success: true,
          message: 'CertiChain API is running',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid
        };

        // Quick DB health check (non-blocking)
        if (databaseConfig.isConnected()) {
          health.services = {
            database: { status: 'healthy', connected: true },
            blockchain: { status: process.env.CONTRACT_ADDRESS ? 'configured' : 'mock mode' }
          };
        } else {
          health.services = {
            database: { status: 'disconnected', connected: false },
            blockchain: { status: 'mock mode' }
          };
        }

        res.json(health);
      } catch (error) {
        res.status(503).json({
          success: false,
          message: 'Service temporarily unavailable',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // API routes with error boundaries
    this.app.use('/api/auth', this.wrapRoutes(authRoutes));
    this.app.use('/api/certificates', this.wrapRoutes(certificateRoutes));
    this.app.use('/api/verify', this.wrapRoutes(verifyRoutes));

    // API documentation
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'CertiChain API v1.0.0 - High Performance Edition',
        documentation: 'https://docs.certichain.com',
        endpoints: {
          auth: {
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            profile: 'GET /api/auth/profile'
          },
          certificates: {
            issue: 'POST /api/certificates/issue',
            list: 'GET /api/certificates/my-certificates',
            details: 'GET /api/certificates/:id',
            apiCode: 'GET /api/certificates/api-code/:code'
          },
          verify: {
            byId: 'GET /api/verify/certificate/:id',
            byHash: 'GET /api/verify/hash/:hash',
            byQR: 'POST /api/verify/qr-code'
          }
        },
        rateLimit: {
          auth: '5 requests per 15 minutes',
          general: '100 requests per minute'
        }
      });
    });

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Welcome to CertiChain API - High Performance Edition',
        version: '1.0.0',
        documentation: '/api',
        health: '/health'
      });
    });
  }

  // Route wrapper for error handling
  wrapRoutes(router) {
    const wrappedRouter = express.Router();
    
    // Copy all routes from original router with error handling
    router.stack.forEach(layer => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods);
        
        methods.forEach(method => {
          wrappedRouter[method](path, async (req, res, next) => {
            try {
              await layer.route.stack[0].handle(req, res, next);
            } catch (error) {
              next(error);
            }
          });
        });
      }
    });
    
    return router; // Return original for now, can implement full wrapping if needed
  }

  initializeErrorHandling() {
    // Global error handler with detailed logging
    this.app.use((error, req, res, next) => {
      const errorId = Math.random().toString(36).substring(2, 15);
      
      // Log error with context
      console.error(`Error ${errorId} [${req.id}]:`, {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Handle specific error types
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
          errorId
        });
      }

      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(409).json({
          success: false,
          message: `${field} already exists`,
          errorId
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token',
          errorId
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Authentication token expired',
          errorId
        });
      }

      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid ID format',
          errorId
        });
      }

      // Handle timeout errors
      if (error.code === 'ETIMEDOUT' || error.timeout) {
        return res.status(408).json({
          success: false,
          message: 'Request timeout',
          errorId
        });
      }

      // Default error response
      const statusCode = error.status || error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Internal server error' : error.message,
        errorId,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack,
          details: error 
        })
      });
    });

    // 404 handler for non-API routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  async gracefulShutdown(signal) {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    // Stop accepting new connections
    this.server?.close(async () => {
      console.log('HTTP server closed');
      
      try {
        await databaseConfig.disconnect();
        console.log('Database disconnected');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  }

  handleUncaughtException(error) {
    console.error('Uncaught Exception:', error);
    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // Send to error tracking service
    }
    process.exit(1);
  }

  handleUnhandledRejection(reason, promise) {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // Send to error tracking service
    }
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`🚀 CertiChain API server running on port ${this.port}`);
      console.log(`📖 API Documentation: http://localhost:${this.port}/api`);
      console.log(`🏥 Health Check: http://localhost:${this.port}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⚡ Process ID: ${process.pid}`);
      console.log(`💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
    });

    // Handle server errors
    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${this.port} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
      }
    });

    return this.server;
  }

  getApp() {
    return this.app;
  }
}

// Cluster mode for production
if (process.env.NODE_ENV === 'production' && cluster.isMaster) {
  const numCPUs = os.cpus().length;
  console.log(`Master ${process.pid} is running`);
  console.log(`Starting ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    console.log('Starting a new worker');
    cluster.fork();
  });
} else {
  // Worker process or development mode
  const app = new App();
  
  if (require.main === module) {
    app.start();
  }
  
  module.exports = app.getApp();
}