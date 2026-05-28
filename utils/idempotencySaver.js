import pool from '../db.js';

/**
 * Persists a completed response to the processed_requests table so that
 * subsequent requests bearing the same idempotency key can receive the
 * identical cached reply without re-executing the business logic.
 *
 * @param {string} key         - The idempotency key from the original request.
 * @param {number} statusCode  - The HTTP status code of the response being cached.
 * @param {object} body        - The JSON-serialisable response body to cache.
 * @returns {Promise<void>}
 * @throws Will throw if the INSERT fails for any reason other than a duplicate
 *         key conflict, allowing the caller to decide how to handle it.
 */
const saveResponse = async (key, statusCode, body) => {
  // Use a parameterised query to prevent SQL injection. The INSERT is
  // intentionally idempotent via ON CONFLICT DO NOTHING: if two concurrent
  // requests race on the same key the second write is safely discarded and the
  // first cached value wins.
  const query = `
    INSERT INTO processed_requests (idempotency_key, status_code, response_body)
    VALUES ($1, $2, $3)
    ON CONFLICT (idempotency_key) DO NOTHING
  `;

  await pool.query(query, [key, statusCode, JSON.stringify(body)]);
};

export default saveResponse;
