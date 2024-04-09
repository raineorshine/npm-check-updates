import { nodeExternals } from 'rollup-plugin-node-externals'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => ({
  plugins: [
    dts({
      entryRoot: 'src',
      rollupTypes: true,
      include: ['src'],
    }),
    nodeExternals(),
    process.env.ANALYZER && analyzer(),
  ],
  ssr: {
    // bundle and treeshake everything
    noExternal: true,
  },
  build: {
    ssr: true,
    lib: {
      entry: ['src/index.ts', 'src/bin/cli.ts'],
      formats: ['cjs'],
    },
    target: 'node18',
    outDir: 'build',
    sourcemap: true,
    minify: mode === 'production' && 'esbuild',
  },
}))
