import { defineConfig } from 'vitest/config'

// bun tests are isolated from the main suite since they require the bun runtime
export default defineConfig({
  test: {
    include: ['test/bun/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./test/helpers/vitestSetup.ts'],
    chaiConfig: {
      truncateThreshold: 0,
    },
  },
})
