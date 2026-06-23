import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // bun tests require the bun runtime and run separately via test:bun
    exclude: [...configDefaults.exclude, 'test/bun/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./test/helpers/vitestSetup.ts'],
    // do not truncate strings in error messages
    chaiConfig: {
      truncateThreshold: 0,
    },
  },
})
