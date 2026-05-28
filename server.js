import express from 'express';
import dotenv from 'dotenv';
import pool from './db.js';
import idempotencyMiddleware from './middleware/idempotency.js';
import saveResponse from './utils/idempotencySaver.js';
import rentRouter from './routes/rent.js';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '127.0.0.1'; // Enforces local loopback binding for security guidelines

// Parse JSON request bodies
app.use(express.json());

// Health check endpoint returning 200 OK
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Test route: POST /api/test-idempotency
//
// Demonstrates idempotency middleware in action.
//   - First request: generates a random number, caches it, and returns it.
//   - Subsequent requests with the same x-idempotency-key: middleware
//     short-circuits and replays the cached response; this handler is never
//     reached again for that key.
// ---------------------------------------------------------------------------
app.post(
  '/api/test-idempotency',
  idempotencyMiddleware,
  async (req, res) => {
    try {
      const statusCode = 200;
      const body = {
        message: 'Request processed successfully.',
        randomNumber: Math.floor(Math.random() * 1_000_000),
        processedAt: new Date().toISOString(),
        idempotencyKey: req.idempotencyKey,
      };

      // Persist the response before sending it so that the cache is populated
      // even if the client disconnects immediately after receiving the reply.
      await saveResponse(req.idempotencyKey, statusCode, body);

      return res.status(statusCode).json(body);
    } catch (err) {
      // Log full detail internally; return a generic message to callers — CWE-209.
      console.error('POST /api/test-idempotency error:', err.message);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred while processing your request.',
      });
    }
  },
);

// Mount the GPU rental router
app.use('/api/rent', rentRouter);

// Test the database connection on startup
pool.query('SELECT NOW()')
  .then(() => {
    console.log('DB Connected');
  })
  .catch((err) => {
    console.error('DB Connection Error:', err.message);
  });

// Listen on configured port and host
app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
