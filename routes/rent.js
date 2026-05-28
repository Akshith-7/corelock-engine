import express from 'express';
import pool from '../db.js';
import idempotencyMiddleware from '../middleware/idempotency.js';
import saveResponse from '../utils/idempotencySaver.js';
import { addProvisioningJob } from '../queue/gpuQueue.js';

const router = express.Router();

/**
 * POST /api/rent
 *
 * Provisions a GPU for the caller using PostgreSQL row-level locking
 * (SELECT ... FOR UPDATE) to prevent double-booking race conditions.
 *
 * Expected request body:  { "gpu_id": "<uuid>" }
 * Required header:        x-idempotency-key
 *
 * Response codes:
 *   202 — GPU successfully transitioned to 'provisioning'.
 *   400 — Missing or malformed gpu_id.
 *   409 — GPU is not available (already provisioning / rented).
 *   404 — GPU with the given id does not exist.
 *   500 — Unexpected server error (transaction rolled back).
 */
router.post('/', idempotencyMiddleware, async (req, res) => {
  // -----------------------------------------------------------------------
  // 1.  Input validation
  // -----------------------------------------------------------------------
  const { gpu_id } = req.body;

  if (!gpu_id || typeof gpu_id !== 'string' || gpu_id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Request body must include a valid "gpu_id" (UUID string).',
    });
  }

  // Basic UUID v4 format guard — prevents obviously invalid values from
  // hitting the database. The column type is UUID so PG would reject them
  // anyway, but failing early saves a round trip.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(gpu_id.trim())) {
    return res.status(400).json({
      error: 'Bad Request',
      message: '"gpu_id" must be a valid UUID.',
    });
  }

  const sanitisedGpuId = gpu_id.trim();

  // -----------------------------------------------------------------------
  // 2.  Acquire a dedicated client for the transaction
  // -----------------------------------------------------------------------
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    // --------------------------------------------------------------------
    // 3.  BEGIN the transaction
    // --------------------------------------------------------------------
    await client.query('BEGIN');
    transactionStarted = true;

    // --------------------------------------------------------------------
    // 4.  Lock the row — SELECT ... FOR UPDATE acquires an exclusive
    //     row-level lock that blocks any concurrent transaction attempting
    //     to lock the same row until this transaction ends.
    // --------------------------------------------------------------------
    const lockResult = await client.query(
      'SELECT id, name, status FROM gpus WHERE id = $1 FOR UPDATE',
      [sanitisedGpuId],
    );

    // GPU does not exist at all.
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      client.release();

      const statusCode = 404;
      const body = {
        error: 'Not Found',
        message: `GPU with id "${sanitisedGpuId}" does not exist.`,
      };

      await saveResponse(req.idempotencyKey, statusCode, body);
      return res.status(statusCode).json(body);
    }

    const gpu = lockResult.rows[0];

    // --------------------------------------------------------------------
    // 5.  Guard: GPU must be 'available' to be rented
    // --------------------------------------------------------------------
    if (gpu.status !== 'available') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      client.release();

      const statusCode = 409;
      const body = {
        error: 'Conflict',
        message: `GPU "${gpu.name}" is currently "${gpu.status}" and cannot be rented.`,
        gpu_id: gpu.id,
        current_status: gpu.status,
      };

      await saveResponse(req.idempotencyKey, statusCode, body);
      return res.status(statusCode).json(body);
    }

    // --------------------------------------------------------------------
    // 6.  Transition the GPU to 'provisioning'
    // --------------------------------------------------------------------
    await client.query(
      'UPDATE gpus SET status = $1, rented_at = NOW() WHERE id = $2',
      ['provisioning', sanitisedGpuId],
    );

    await client.query('COMMIT');
    transactionStarted = false;

    // Enqueue the background job to finish provisioning (Phase 4)
    await addProvisioningJob(sanitisedGpuId);

    client.release();

    // --------------------------------------------------------------------
    // 7.  Cache and return the 202 Accepted response
    // --------------------------------------------------------------------
    const statusCode = 202;
    const body = {
      message: `GPU "${gpu.name}" is now provisioning.`,
      gpu_id: gpu.id,
      status: 'provisioning',
      rented_at: new Date().toISOString(),
    };

    await saveResponse(req.idempotencyKey, statusCode, body);
    return res.status(statusCode).json(body);

  } catch (err) {
    // ------------------------------------------------------------------
    // 8.  Catch-all: roll back the transaction if still active and
    //     release the client back to the pool.
    // ------------------------------------------------------------------
    if (transactionStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('ROLLBACK failed:', rollbackErr.message);
      }
    }

    if (client) {
      try {
        client.release();
      } catch (releaseErr) {
        console.error('Client release failed:', releaseErr.message);
      }
    }

    // Log the full error internally; return a generic message — CWE-209.
    console.error('POST /api/rent error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request.',
    });
  }
});

export default router;
