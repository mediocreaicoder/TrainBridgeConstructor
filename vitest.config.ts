import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't load the React plugin or
// start vite-plugin-checker. Game logic is DOM-free, so tests run in Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'],
  },
});
