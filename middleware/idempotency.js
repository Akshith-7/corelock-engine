import pool from '../db.js';

/**
 * Idempotency middleware for Express.
 *
 * Behaviour:
 *  1. Requires the `x-idempotency-key` header on every request; returns 400 if absent.
 *  2. Looks up the key in the `processed_requests` table.
 *     - If a cached entry is found, immediately replays the stored status code
 *       and response body and short-circuits the handler chain (no next() call).
 *     - If no entry exists, attaches the key to `req.idempotencyKey` and
 *       yields control to the next middleware / route handler.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const idempotencyMiddleware = async (req, res, next) => {
  const key = req.headers['x-idempotency-key'];

  // Guard: the header is mandatory for all routes that use this middleware.
  if (!key || typeof key !== 'string' || key.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required header: x-idempotency-key',
    });
  }

  const trimmedKey = key.trim();

  try {
    // Parameterised query prevents SQL injection — CWE-89.
    const result = await pool.query(
      'SELECT status_code, response_body FROM processed_requests WHERE idempotency_key = $1',
      [trimmedKey],
    );

    if (result.rows.length > 0) {
      // Cache hit: replay the stored response and stop further processing.
      const { status_code, response_body } = result.rows[0];
      return res.status(status_code).json(response_body);
    }

    // Cache miss: forward the sanitised key to the route handler.
    req.idempotencyKey = trimmedKey;
    return next();
  } catch (err) {
    // Log the full error internally; expose only a generic message to callers
    // to prevent information leakage — CWE-209.
    console.error('Idempotency middleware error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request.',
    });
  }
};

export default idempotencyMiddleware;
