-- Enable UUID extension if not already present (gen_random_uuid is built-in on PG 13+, but good for older versions)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they already exist for a clean setup
DROP TABLE IF EXISTS gpus;
DROP TABLE IF EXISTS processed_requests;

-- Create gpus table
CREATE TABLE gpus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CONSTRAINT chk_gpu_status CHECK (status IN ('available', 'provisioning', 'rented')),
    rented_at TIMESTAMP WITH TIME ZONE NULL
);

-- Create processed_requests table for idempotency tracking
CREATE TABLE processed_requests (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed 5 dummy GPUs with the status 'available'
INSERT INTO gpus (name, status, rented_at) VALUES
('NVIDIA H100', 'available', NULL),
('NVIDIA A100', 'available', NULL),
('NVIDIA L40S', 'available', NULL),
('NVIDIA RTX 4090', 'available', NULL),
('NVIDIA A10G', 'available', NULL);
