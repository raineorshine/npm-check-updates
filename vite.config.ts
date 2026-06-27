import { chmodSync } from 'fs'
import dts from 'unplugin-dts/vite'
import { type Plugin, defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import { buildOptions } from './scripts/build-options'

/**
 * A Vite plugin that triggers the `buildOptions` logic at the start of the build process.
 * This ensures that any necessary configuration or pre-build steps
 * are executed before the actual bundling begins.
 */
function buildOptionsPlugin(): Plugin {
  return {
    name: 'build-options',
    async configResolved() {
      await buildOptions()
    },
  }
}

/** Makes the CLI entry point executable after build (cross-platform fs.chmodSync). */
function chmodBinPlugin(): Plugin {
  return {
    name: 'chmod-bin',
    closeBundle() {
      chmodSync('build/cli.js', 0o755)
    },
  }
}

/**
 * Replaces the given module ids with an empty default export.
 * Used to drop optional dependencies that are bundled but never reached at runtime.
 */
function stubModulesPlugin(ids: string[]): Plugin {
  return {
    name: 'stub-modules',
    enforce: 'pre',
    resolveId(id) {
      return ids.includes(id) ? id : null
    },
    load(id) {
      return ids.includes(id) ? 'export default {}' : null
    },
  }
}

/** A simple helper to run analyzer plugin only once */
function analyzerOnce(): Plugin {
  let ran = false
  const base = analyzer() as Plugin

  return {
    ...base,
    name: (base.name ?? 'analyzer') + '-once',
    generateBundle(...args) {
      if (ran) return
      ran = true
      if (typeof base.generateBundle === 'function') {
        console.log('run analyzer')
        return base.generateBundle.call(this, ...args)
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    /**
     * buildOptionsPlugin() must run before dts() so the files exist
     * when TypeScript scans
     */
    buildOptionsPlugin(),
    dts({
      entryRoot: 'src',
      include: ['src'],
      /**
       * Inline semver-utils types so the emitted .d.ts has no external import.
       * semver-utils is bundled into the JS, not a runtime dependency.
       */
      bundleTypes: {
        bundledPackages: ['semver-utils', '@types/semver-utils'],
      },
      insertTypesEntry: true,
      outDirs: 'build',
    }),
    chmodBinPlugin(),
    /**
     * Optional deps that get bundled but ncu never reaches at runtime:
     * - iconv-lite: only used by minipass-fetch's textConverted(), which ncu never calls
     * - @colors/colors: only used by cli-table3 for cell style colors, which ncu does not set
     */
    stubModulesPlugin(['iconv-lite', '@colors/colors/safe', '@colors/colors']),
    ...(process.env.ANALYZER ? [analyzerOnce()] : []),
  ],
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        cli: 'src/bin/cli.ts',
      },
    },
    target: 'node20',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' && 'oxc',
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: [
        {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          exports: 'named',
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs', // The fix for p-map
          exports: 'named',
        },
      ],
    },
  },
}))
