/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['apps/api/src/tests/test-env.ts'],
    environment: 'node',
  },
});
