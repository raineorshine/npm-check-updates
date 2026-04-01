import { type Plugin, defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import dts from 'vite-plugin-dts'
import { buildOptions } from './src/scripts/build-options.js'

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
      rollupTypes: true,
      insertTypesEntry: true,
      outDir: 'build',
    }),
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
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    target: 'node20',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' && 'esbuild',
    rollupOptions: {
      output: {
        exports: 'named',
        chunkFileNames: 'chunks/[name]-[format].js',
      },
    },
  },
}))
