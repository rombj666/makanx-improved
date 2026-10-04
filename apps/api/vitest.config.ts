/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['src/tests/test-env.ts'],
    environment: 'node',
  },
});
