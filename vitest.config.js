import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Optional: to use Vitest's globals like describe, it, expect without importing
    environment: 'node', // Specify Node.js environment for testing
    include: ['**/*.test.js'], // Pattern to find test files
    // You can add more configurations here as needed, e.g.:
    // setupFiles: ['./tests/setup.js'], // For global test setup
    // coverage: {
    //   provider: 'v8', // or 'istanbul'
    //   reporter: ['text', 'json', 'html'],
    // },
  },
});
