import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
  ? { connectionString }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

// Enforce configuration check at startup to fail-close early
if (!connectionString && (!poolConfig.database || !poolConfig.user)) {
  throw new Error('Database configuration missing. Set DATABASE_URL or DB_NAME and DB_USER in your environment.');
}

// Production-grade PostgreSQL pool configuration
const pool = new Pool({
  ...poolConfig,
  // Maximum number of clients the pool should contain
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // How long a client is allowed to remain idle before being closed
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  // How long to wait when connecting before timing out
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT || '2000', 10),
  // SSL support for secure transmission in production
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

// Capture unexpected errors on idle pool clients
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

export default pool;
