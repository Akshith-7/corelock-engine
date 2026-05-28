import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Standard Redis connection handling
// In a production environment, you'd pull this from process.env
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Initialize the BullMQ Queue
export const gpuProvisioningQueue = new Queue('gpu-provisioning-queue', {
  connection,
});

/**
 * Adds a GPU provisioning job to the background queue.
 *
 * @param {string} gpuId - The UUID of the GPU to provision.
 * @returns {Promise<import('bullmq').Job>} The created job.
 */
export const addProvisioningJob = async (gpuId) => {
  if (!gpuId) {
    throw new Error('gpuId is required to add a provisioning job.');
  }

  // Enqueue the job. We can give it a name like 'provision-gpu'
  const job = await gpuProvisioningQueue.add('provision-gpu', { gpuId });
  return job;
};
