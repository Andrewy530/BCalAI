import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Pin the runner's zone so time-zone tests assert conversion logic rather
    // than whichever machine happens to run them.
    environment: 'node',
  },
});
