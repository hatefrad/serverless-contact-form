// Global test setup for Vitest
import { vi, beforeEach, afterEach } from 'vitest';

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock process.env for consistent testing
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  
  // Reset environment variables with defaults for each test
  process.env = { 
    ...originalEnv,
    EMAIL: 'test@example.com',
    DOMAIN: '*',
    AWS_REGION: 'us-east-1'
  };
  
  // Clear rate limiting storage between tests
  const { resetRateLimit } = require('../src/security');
  resetRateLimit();
});

afterEach(() => {
  process.env = originalEnv;
});