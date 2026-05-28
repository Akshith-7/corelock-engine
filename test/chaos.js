import crypto from 'crypto';

const API_URL = 'http://127.0.0.1:3000/api/rent';

/**
 * Fires a single POST request to the /api/rent endpoint.
 */
const sendRentRequest = async (gpuId, idempotencyKey) => {
  const start = Date.now();
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ gpu_id: gpuId }),
    });

    const body = await response.json();
    const duration = Date.now() - start;

    return {
      status: response.status,
      duration,
      body,
    };
  } catch (err) {
    return {
      status: 500,
      duration: Date.now() - start,
      error: err.message,
    };
  }
};

const runChaosTests = async () => {
  console.log('===========================================================');
  console.log('                 CORELOCK CHAOS TESTING');
  console.log('===========================================================\n');

  // Placeholders for GPUs to test on.
  // In a real environment, you would paste valid UUIDs of available GPUs here.
  const TARGET_GPU_1 = 'd58da03a-de19-4344-be44-ca6cfe6f1e03';
  const TARGET_GPU_2 = '03576124-46a8-4e3f-931e-207385cbbeba';

  // --------------------------------------------------------------------------
  // TEST 1: The Idempotency Storm
  // --------------------------------------------------------------------------
  console.log('>>> TEST 1: The Idempotency Storm');
  console.log(`Target GPU: ${TARGET_GPU_1}`);

  // Generate exactly ONE idempotency key for all 5 requests.
  const idempotencyKey1 = crypto.randomUUID();
  console.log(`Using ONE shared key: ${idempotencyKey1}`);
  console.log('Firing 5 identical requests concurrently...\n');

  // Fire 5 identical requests at the exact same millisecond using Promise.all
  const promisesTest1 = Array.from({ length: 5 }).map(() =>
    sendRentRequest(TARGET_GPU_1, idempotencyKey1)
  );

  const resultsTest1 = await Promise.all(promisesTest1);

  resultsTest1.forEach((res, index) => {
    console.log(`Request ${index + 1}: Status ${res.status} | Duration: ${res.duration}ms | Response:`, JSON.stringify(res.body));
  });

  const allStatusesMatch = resultsTest1.every(r => r.status === resultsTest1[0].status);

  console.log('\n--- Test 1 Results ---');
  console.log(`Total Requests: 5`);
  console.log(`Identical Status Code Returned for All: ${allStatusesMatch ? 'YES' : 'NO'} (${resultsTest1[0].status})`);
  console.log(`(If the GPU was valid and available, we expect 5 total 202 Accepted responses. 4 of them are lightning-fast cache hits.)\n\n`);

  // --------------------------------------------------------------------------
  // TEST 2: The Race Condition Collision
  // --------------------------------------------------------------------------
  console.log('>>> TEST 2: The Race Condition Collision');
  console.log(`Target GPU: ${TARGET_GPU_2}`);

  // Generate 5 DIFFERENT unique idempotency keys.
  const keysTest2 = Array.from({ length: 5 }).map(() => crypto.randomUUID());
  console.log(`Using 5 DIFFERENT keys:`);
  keysTest2.forEach((k, i) => console.log(`  Key ${i + 1}: ${k}`));
  console.log('\nFiring 5 unique requests concurrently...\n');

  // Fire 5 requests at the exact same millisecond
  const promisesTest2 = keysTest2.map((key) => sendRentRequest(TARGET_GPU_2, key));
  const resultsTest2 = await Promise.all(promisesTest2);

  let acceptedCount2 = 0;
  let conflictCount2 = 0;
  let otherCount2 = 0;

  resultsTest2.forEach((res, index) => {
    console.log(`Request ${index + 1}: Status ${res.status} | Duration: ${res.duration}ms | Response:`, JSON.stringify(res.body));
    if (res.status === 202) acceptedCount2++;
    else if (res.status === 409) conflictCount2++;
    else otherCount2++;
  });

  console.log('\n--- Test 2 Results ---');
  console.log(`Total Requests: 5`);
  console.log(`Success (202):  ${acceptedCount2}`);
  console.log(`Conflict (409): ${conflictCount2}`);
  console.log(`Other Status:   ${otherCount2}`);

  console.log('\n(If the GPU was valid and available, we expect exactly ONE request to succeed (202 Accepted) and exactly FOUR to fail cleanly (409 Conflict).)');
  console.log('The row-level lock (SELECT ... FOR UPDATE) forces concurrent requests to queue up, preventing double-booking.');
  console.log('===========================================================\n');
};

// Execute and handle any uncaught rejections gracefully
runChaosTests().catch(err => {
  console.error('\n[!] Chaos test script crashed with an unexpected error:', err.message);
});
