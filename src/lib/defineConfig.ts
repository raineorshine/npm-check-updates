import type { RcOptions } from '../types/RcOptions.ts'

/**
 * TypeScript helper for .npmrc config file. Similar to vite and eslint's
 * defineConfig helper
 */
function defineConfig(config: RcOptions) {
  return config
}

export default defineConfig
