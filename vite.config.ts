import { nodeExternals } from 'rollup-plugin-node-externals'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: 'log-imports',
      resolveId(source, importer) {
        console.log(`[resolve] ${source} <- ${importer}`)
        return null // let Vite handle it normally
      },
    },
    dts({
      entryRoot: 'src',
      rollupTypes: true,
      include: ['src'],
      insertTypesEntry: true,
    }),
    nodeExternals(),
    ...(process.env.ANALYZER ? [analyzer()] : []),
  ],
  ssr: {
    // bundle and treeshake everything
    noExternal: true,
  },
  build: {
    ssr: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        cli: 'src/bin/cli.ts',
      },
      // Essential for the 'type: module' migration
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    target: 'node20',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' ? 'esbuild' : false,
  },
}))
