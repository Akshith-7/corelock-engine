import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import pool from './db.js';

// Standard Redis connection handling
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required by BullMQ
});

console.log('Worker initializing, listening to "gpu-provisioning-queue"...');

const worker = new Worker(
  'gpu-provisioning-queue',
  async (job) => {
    const { gpuId } = job.data;
    
    // a. Log that provisioning has started for the gpuId.
    console.log(`[Job ${job.id}] Provisioning started for GPU: ${gpuId}`);
    
    // b. Await a setTimeout of 10,000ms (10 seconds) wrapped in a Promise to simulate the server boot.
    await new Promise((resolve) => setTimeout(resolve, 10000));
    
    // c. Once the timeout completes, execute an UPDATE query using the pool to change the GPU's status from 'provisioning' to 'rented'.
    try {
      await pool.query(
        "UPDATE gpus SET status = 'rented' WHERE id = $1 AND status = 'provisioning'",
        [gpuId]
      );
      
      // d. Log a bright success message that the GPU is fully rented.
      console.log(`\x1b[32m[Job ${job.id}] SUCCESS: GPU ${gpuId} is fully rented!\x1b[0m`);
    } catch (err) {
      console.error(`[Job ${job.id}] ERROR: Failed to update GPU ${gpuId}:`, err.message);
      throw err; // Re-throw to let BullMQ handle the failure/retries
    }
  },
  { connection }
);

worker.on('error', (err) => {
  console.error('Worker error:', err);
});
