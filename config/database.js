const mongoose = require('mongoose');
const redis = require('redis');

class DatabaseConfig {
  constructor() {
    this.connection = null;
    this.redisClient = null;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      // Try MongoDB Atlas first, then local MongoDB
      const mongoURI = process.env.MONGODB_URI || 
                      process.env.MONGODB_ATLAS_URI || 
                      'mongodb+srv://cluster0.mongodb.net/certichain' ||
                      'mongodb://127.0.0.1:27017/certichain';
      
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true
      };

      console.log('🔄 Attempting MongoDB connection...');
      this.connection = await mongoose.connect(mongoURI, options);
      this.connectionRetries = 0;
      
      console.log(`✅ MongoDB connected: ${this.connection.connection.host}`);
      console.log(`📊 Database: ${this.connection.connection.name}`);
      
      // Connection event handlers
      mongoose.connection.on('error', this.handleConnectionError.bind(this));
      mongoose.connection.on('disconnected', this.handleDisconnection.bind(this));
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
        this.connectionRetries = 0;
      });

      // Initialize Redis for caching (optional)
      await this.initializeRedis();

      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      console.log('⚠️ Running in mock database mode for development');
      
      // Create mock connection for development
      this.connection = { connection: { host: 'mock', name: 'certichain-mock' } };
      return this.connection;
    }
  }

  async initializeRedis() {
    try {
      if (process.env.REDIS_URL) {
        this.redisClient = redis.createClient({
          url: process.env.REDIS_URL,
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              return new Error('Redis server connection refused');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              return new Error('Redis retry time exhausted');
            }
            if (options.attempt > 10) {
              return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
          }
        });

        await this.redisClient.connect();
        console.log('✅ Redis connected for caching');
        
        this.redisClient.on('error', (err) => {
          console.warn('⚠️ Redis error:', err.message);
        });
      }
    } catch (error) {
      console.warn('⚠️ Redis connection failed, continuing without cache:', error.message);
    }
  }

  handleConnectionError(error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // Attempt reconnection for certain errors
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`🔄 Attempting reconnection (${this.connectionRetries}/${this.maxRetries})...`);
        setTimeout(() => this.connect(), 2000);
      }
    }
  }

  handleDisconnection() {
    console.log('⚠️ MongoDB disconnected');
    
    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      console.log(`🔄 Attempting reconnection (${this.connectionRetries}/${this.maxRetries})...`);
      setTimeout(() => this.connect(), 2000);
    }
  }

  async disconnect() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
        console.log('✅ Redis connection closed');
      }
      
      if (this.connection) {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
      }
    } catch (error) {
      console.error('❌ Error closing database connections:', error);
    }
  }

  getConnection() {
    return this.connection;
  }

  isConnected() {
    return mongoose.connection && mongoose.connection.readyState === 1;
  }

  // Enhanced health check with performance metrics
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        throw new Error('Database not connected');
      }

      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - startTime;
      
      const stats = await this.getConnectionStats();
      
      return {
        status: 'healthy',
        connected: true,
        responseTime: `${responseTime}ms`,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        readyState: this.getReadyStateText(mongoose.connection.readyState),
        connectionPool: stats,
        redis: this.redisClient ? 'connected' : 'not configured'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        readyState: this.getReadyStateText(mongoose.connection.readyState)
      };
    }
  }

  getReadyStateText(state) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[state] || 'unknown';
  }

  async getConnectionStats() {
    try {
      const db = mongoose.connection.db;
      const admin = db.admin();
      
      const [serverStatus, dbStats] = await Promise.all([
        admin.serverStatus(),
        db.stats()
      ]);

      return {
        activeConnections: serverStatus.connections?.current || 0,
        availableConnections: serverStatus.connections?.available || 0,
        totalConnections: serverStatus.connections?.totalCreated || 0,
        collections: dbStats.collections || 0,
        dataSize: this.formatBytes(dbStats.dataSize || 0),
        storageSize: this.formatBytes(dbStats.storageSize || 0),
        indexes: dbStats.indexes || 0,
        objects: dbStats.objects || 0
      };
    } catch (error) {
      return {
        error: 'Unable to fetch connection stats',
        message: error.message
      };
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Caching methods
  async getCache(key) {
    if (!this.redisClient) return null;
    try {
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('Cache get error:', error.message);
      return null;
    }
  }

  async setCache(key, value, ttl = 3600) {
    if (!this.redisClient) return false;
    try {
      await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Cache set error:', error.message);
      return false;
    }
  }

  async deleteCache(key) {
    if (!this.redisClient) return false;
    try {
      await this.redisClient.del(key);
      return true;
    } catch (error) {
      console.warn('Cache delete error:', error.message);
      return false;
    }
  }

  // Performance monitoring
  async getPerformanceMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        database: await this.healthCheck(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage()
      };

      return metrics;
    } catch (error) {
      return {
        error: 'Unable to fetch performance metrics',
        message: error.message
      };
    }
  }
}

module.exports = new DatabaseConfig();