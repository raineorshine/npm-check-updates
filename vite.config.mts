import { nodeExternals } from 'rollup-plugin-node-externals'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => ({
  plugins: [
    dts({
      entryRoot: 'src',
      rollupTypes: true,
      include: ['src'],
    }),
    nodeExternals(),
  ],
  ssr: {
    // bundle and treeshake everything
    noExternal: true,
  },
  build: {
    ssr: true,
    lib: {
      entry: ['src/index.ts', 'src/bin/cli.ts'],
      formats: ['es'],
    },
    target: 'node18',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' && 'esbuild',
  },
}))
