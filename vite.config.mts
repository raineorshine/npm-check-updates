import { chmodSync, existsSync } from 'fs'
import path from 'path'
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
    {
      name: 'fixBinPerm',
      writeBundle: () => {
        const scriptFile = path.resolve('build', 'cli.js')
        console.log('end', scriptFile)
        if (existsSync(scriptFile)) {
          console.log('exist', scriptFile)
          chmodSync(scriptFile, '0755')
        }
      },
    },
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
    minify: mode === 'production' && 'esbuild',
  },
}))
