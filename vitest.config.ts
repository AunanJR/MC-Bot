import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          testTimeout: 15 * 60_000,
          hookTimeout: 5 * 60_000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
