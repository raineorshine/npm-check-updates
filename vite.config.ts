import { chmodSync } from 'fs'
import { type Plugin, defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import dts from 'vite-plugin-dts'
import { buildOptions } from './src/scripts/build-options.js'

/**
 * cosmiconfig bundles a TypeScript loader that dynamically imports the
 * `typescript` package (~5MB). Even though we exclude `.ts` from
 * `searchPlaces`, Vite's static analysis traces the `require('typescript')`
 * inside `loadTsSync` and includes the entire package in the build.
 *
 * This plugin stubs out the `typescript` module to prevent it from being
 * bundled. The stub is never invoked at runtime because `.ts` configs are
 * not in our `searchPlaces`.
 */
function stubTypescript(): Plugin {
  return {
    name: 'stub-typescript',
    enforce: 'pre',
    resolveId(id) {
      // Fast path: skip the string comparison for 99.9% of ids
      if (id.length !== 10 || id[0] !== 't') return
      if (id === 'typescript') return '\0stub:typescript'
    },
    load(id) {
      if (id === '\0stub:typescript') {
        return `
export const version = '0.0.0-stub';
export function createProgram() {
  throw new Error('TypeScript loader is not available in this build');
}
export default { version, createProgram };
`.trim()
      }
    },
  }
}

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
    stubTypescript(),
    /**
     * buildOptionsPlugin() must run before dts() so the files exist
     * when TypeScript scans
     */
    buildOptionsPlugin(),
    dts({
      entryRoot: 'src',
      include: ['src'],
      rollupTypes: true,
      insertTypesEntry: true,
      outDir: 'build',
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
    minify: mode === 'production' && 'esbuild',
    rollupOptions: {
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
