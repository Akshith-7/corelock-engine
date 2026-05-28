# CoreLock: Distributed Cloud GPU Provisioning Engine 🚀

A high-concurrency backend microservice designed to simulate the dynamic provisioning of ephemeral GPU instances. Built with **Node.js**, **PostgreSQL**, and **Redis**, this engine prioritizes system resilience, handling simultaneous API strikes without race conditions or database deadlocks.

## 🧠 Core Architecture & System Design

* **Race-Condition Protection:** Implemented PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) within ACID transactions to guarantee zero double-bookings when multiple users request the same GPU at the exact same millisecond.
* **Asynchronous Background Workers:** Decoupled heavy provisioning tasks from the main thread using **Redis** and **BullMQ**. The Express API responds instantly (`202 Accepted` in < 50ms), while a worker process handles the simulated hardware boot sequence.
* **Idempotency Middleware:** Engineered a custom API gateway layer that intercepts duplicate client network retries using UUIDs, returning cached states to prevent redundant database processing.
* **Chaos Testing Suite:** Built a custom testing script using `Promise.all()` to intentionally bombard the API with concurrent requests, mathematically proving the database locks cleanly reject duplicate payloads with `409 Conflicts`.

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (pg)
* **Queue / Cache:** Redis, BullMQ
* **Testing:** Native JS Fetch, Custom Chaos Scripts
