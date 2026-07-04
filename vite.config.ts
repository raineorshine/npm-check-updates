import fs from 'node:fs'
import dts from 'unplugin-dts/vite'
import { type Plugin, defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import { buildOptions } from './scripts/build-options.ts'

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
    writeBundle() {
      // chmodSync will throw if cli.js is missing so that we notice.
      fs.chmodSync('build/cli.js', 0o755)
      // drop the empty `export {}` cli.d.ts dts emits for the export-less cli entry
      fs.rmSync('build/cli.d.ts', { force: true })
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
  const base = analyzer() as Plugin
  const generate = base.generateBundle
  let ran = false

  return {
    ...base,
    name: `${base.name}-once`,
    generateBundle(...args) {
      if (ran || typeof generate !== 'function') return
      ran = true
      console.log('\nrun analyzer')
      return generate.apply(this, args)
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
     * iconv-lite is an optional dep of minipass-fetch, only used by textConverted(),
     * which ncu never calls. Stub it so it stays out of the bundle.
     */
    stubModulesPlugin(['iconv-lite']),
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
      formats: ['es'],
    },
    target: 'node22',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' && 'oxc',
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        exports: 'named',
      },
    },
  },
}))
