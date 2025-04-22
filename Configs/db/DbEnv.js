require("dotenv").config();

const env = {
  database: process.env.DATABASE,
  username: process.env.DB_USERNAME ,
  password: process.env.PASSWORD,
  host: process.env.HOST,
  dialect: process.env.DIALECT || 'postgres',
  
  // Connection pool configuration
  pool: {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 60000,
    idle: parseInt(process.env.DB_POOL_IDLE, 10) || 20000,
    evict: 1000, // Run cleanup every second
    handleDisconnects: true
  },
  
  // Query and connection timeout settings
  dialectOptions: {
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000,
    idle_in_transaction_session_timeout: parseInt(process.env.DB_IDLE_TRANSACTION_TIMEOUT, 10) || 30000,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 30000,
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    } : false
  },
  
  // Retry configuration
  retry: {
    max: parseInt(process.env.DB_RETRY_MAX, 10) || 3,
    timeout: parseInt(process.env.DB_RETRY_TIMEOUT, 10) || 5000,
    match: [
      /Deadlock/i,
      /Timeout/i,
      /ConnectionError/i,
      /ConnectionRefused/i,
      /Connection terminated/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i
    ],
    backoffBase: 1000,
    backoffExponent: 1.5
  },
  
  // Additional options
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  logging: (msg) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DB_LOGGING === 'true') {
      console.log(`[Sequelize ${new Date().toISOString()}] ${msg}`);
    }
  },
  benchmark: process.env.NODE_ENV !== 'production',
  
  // Connection validation
  validate: {
    validate: {
      min: 0,
      max: parseInt(process.env.DB_VALIDATE_MAX, 10) || 10000
    }
  }
};

// Enhanced connection testing
const testConnection = async (sequelize) => {
  let retries = 0;
  const maxRetries = env.retry.max;
  const retryTimeout = env.retry.timeout;

  while (retries < maxRetries) {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established successfully');
      
      // Test query to ensure full connectivity
      await sequelize.query('SELECT 1');
      console.log('✅ Database query test successful');
      
      return true;
    } catch (error) {
      retries++;
      console.error(`❌ Database connection attempt ${retries}/${maxRetries} failed:`, error.message);
      
      if (retries === maxRetries) {
        console.error('❌ Maximum connection retries reached. Giving up.');
        return false;
      }

      // Exponential backoff
      const backoffTime = env.retry.backoffBase * Math.pow(env.retry.backoffExponent, retries - 1);
      console.log(`Waiting ${backoffTime}ms before next retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  return false;
};

// Validate environment variables
const validateConfig = () => {
  const requiredVars = ['DATABASE', 'PASSWORD', 'HOST'];
  const missing = requiredVars.filter(var_ => !process.env[var_]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Run validation
validateConfig();

module.exports = { env, testConnection };