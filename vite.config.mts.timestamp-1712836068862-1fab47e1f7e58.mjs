// vite.config.mts
import { nodeExternals } from 'file:///Users/sukka/Project/npm-check-updates/node_modules/rollup-plugin-node-externals/dist/index.js'
import { analyzer } from 'file:///Users/sukka/Project/npm-check-updates/node_modules/vite-bundle-analyzer/dist/index.mjs'
import dts from 'file:///Users/sukka/Project/npm-check-updates/node_modules/vite-plugin-dts/dist/index.mjs'
import { defineConfig } from 'file:///Users/sukka/Project/npm-check-updates/node_modules/vite/dist/node/index.js'

var vite_config_default = defineConfig(({ mode }) => ({
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
export { vite_config_default as default }
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL3N1a2thL1Byb2plY3QvbnBtLWNoZWNrLXVwZGF0ZXNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9zdWtrYS9Qcm9qZWN0L25wbS1jaGVjay11cGRhdGVzL3ZpdGUuY29uZmlnLm10c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvc3Vra2EvUHJvamVjdC9ucG0tY2hlY2stdXBkYXRlcy92aXRlLmNvbmZpZy5tdHNcIjtpbXBvcnQgeyBub2RlRXh0ZXJuYWxzIH0gZnJvbSAncm9sbHVwLXBsdWdpbi1ub2RlLWV4dGVybmFscydcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgeyBhbmFseXplciB9IGZyb20gJ3ZpdGUtYnVuZGxlLWFuYWx5emVyJ1xuaW1wb3J0IGR0cyBmcm9tICd2aXRlLXBsdWdpbi1kdHMnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XG4gIHBsdWdpbnM6IFtcbiAgICBkdHMoe1xuICAgICAgZW50cnlSb290OiAnc3JjJyxcbiAgICAgIHJvbGx1cFR5cGVzOiB0cnVlLFxuICAgICAgaW5jbHVkZTogWydzcmMnXSxcbiAgICB9KSxcbiAgICBub2RlRXh0ZXJuYWxzKCksXG4gICAgcHJvY2Vzcy5lbnYuQU5BTFlaRVIgJiYgYW5hbHl6ZXIoKSxcbiAgXSxcbiAgc3NyOiB7XG4gICAgLy8gYnVuZGxlIGFuZCB0cmVlc2hha2UgZXZlcnl0aGluZ1xuICAgIG5vRXh0ZXJuYWw6IHRydWUsXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgc3NyOiB0cnVlLFxuICAgIGxpYjoge1xuICAgICAgZW50cnk6IFsnc3JjL2luZGV4LnRzJywgJ3NyYy9iaW4vY2xpLnRzJ10sXG4gICAgICBmb3JtYXRzOiBbJ2NqcyddLFxuICAgIH0sXG4gICAgdGFyZ2V0OiAnbm9kZTE4JyxcbiAgICBvdXREaXI6ICdidWlsZCcsXG4gICAgc291cmNlbWFwOiB0cnVlLFxuICAgIG1pbmlmeTogbW9kZSA9PT0gJ3Byb2R1Y3Rpb24nICYmICdlc2J1aWxkJyxcbiAgfSxcbn0pKVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFzUyxTQUFTLHFCQUFxQjtBQUNwVSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixPQUFPLFNBQVM7QUFFaEIsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsTUFDRixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixTQUFTLENBQUMsS0FBSztBQUFBLElBQ2pCLENBQUM7QUFBQSxJQUNELGNBQWM7QUFBQSxJQUNkLFFBQVEsSUFBSSxZQUFZLFNBQVM7QUFBQSxFQUNuQztBQUFBLEVBQ0EsS0FBSztBQUFBO0FBQUEsSUFFSCxZQUFZO0FBQUEsRUFDZDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLE1BQ0gsT0FBTyxDQUFDLGdCQUFnQixnQkFBZ0I7QUFBQSxNQUN4QyxTQUFTLENBQUMsS0FBSztBQUFBLElBQ2pCO0FBQUEsSUFDQSxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxRQUFRLFNBQVMsZ0JBQWdCO0FBQUEsRUFDbkM7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
