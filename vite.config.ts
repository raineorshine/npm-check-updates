import fs from 'node:fs'
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

/** Makes the CLI entry point executable after build */
function chmodBinPlugin(): Plugin {
  return {
    name: 'chmod-bin',
    writeBundle(_options, bundle) {
      if (bundle['cli.js']) {
        fs.chmodSync('build/cli.js', 0o755)
      }
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
