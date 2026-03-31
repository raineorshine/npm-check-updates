import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => ({
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src'],
      rollupTypes: true,
      insertTypesEntry: true,
    }),
    ...(process.env.ANALYZER ? [analyzer()] : []),
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
      fileName: (format, entryName) => `${entryName}.js`,
    },
    target: 'node20',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production',
    rollupOptions: {
      output: {
        // This removes the 'p-map-tgCadq-q.js' hash and uses a cleaner name
        chunkFileNames: 'chunks/[name].js',
        // Ensure the entry points stay exactly where you want them
        entryFileNames: '[name].js',
      },
    },
  },
}))
