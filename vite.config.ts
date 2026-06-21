import fs from 'node:fs'
import dts from 'unplugin-dts/vite'
import { type Plugin, defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'

/** Makes the CLI entry point executable after build (cross-platform fs.chmodSync). */
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
  const base = analyzer() as Plugin
  const generate = base.generateBundle
  let ran = false

  return {
    ...base,
    name: 'analyzer-once',
    generateBundle(...args) {
      if (ran || typeof generate !== 'function') return
      ran = true
      console.log('\nrun analyzer')
      // eslint-disable-next-line unicorn/no-this-outside-of-class -- this is the rollup plugin context
      return generate.apply(this, args)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
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
