// vite.config.mts
import { nodeExternals } from "file:///D:/Dev/VSCode/JavaScript/Torathion/Forks/npm-check-updates/node_modules/rollup-plugin-node-externals/dist/index.js";
import { defineConfig } from "file:///D:/Dev/VSCode/JavaScript/Torathion/Forks/npm-check-updates/node_modules/vite/dist/node/index.js";
import { analyzer } from "file:///D:/Dev/VSCode/JavaScript/Torathion/Forks/npm-check-updates/node_modules/vite-bundle-analyzer/dist/index.mjs";
import dts from "file:///D:/Dev/VSCode/JavaScript/Torathion/Forks/npm-check-updates/node_modules/vite-plugin-dts/dist/index.mjs";
var vite_config_default = defineConfig(({ mode }) => ({
  plugins: [
    dts({
      entryRoot: "src",
      rollupTypes: true,
      include: ["src"]
    }),
    nodeExternals(),
    process.env.ANALYZER && analyzer()
  ],
  ssr: {
    // bundle and treeshake everything
    noExternal: true
  },
  build: {
    ssr: true,
    lib: {
      entry: ["src/index.ts", "src/bin/cli.ts"],
      formats: ["cjs"]
    },
    target: "node18",
    outDir: "build",
    sourcemap: true,
    minify: mode === "production" && "esbuild"
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcRGV2XFxcXFZTQ29kZVxcXFxKYXZhU2NyaXB0XFxcXFRvcmF0aGlvblxcXFxGb3Jrc1xcXFxucG0tY2hlY2stdXBkYXRlc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcRGV2XFxcXFZTQ29kZVxcXFxKYXZhU2NyaXB0XFxcXFRvcmF0aGlvblxcXFxGb3Jrc1xcXFxucG0tY2hlY2stdXBkYXRlc1xcXFx2aXRlLmNvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0Rldi9WU0NvZGUvSmF2YVNjcmlwdC9Ub3JhdGhpb24vRm9ya3MvbnBtLWNoZWNrLXVwZGF0ZXMvdml0ZS5jb25maWcubXRzXCI7aW1wb3J0IHsgbm9kZUV4dGVybmFscyB9IGZyb20gJ3JvbGx1cC1wbHVnaW4tbm9kZS1leHRlcm5hbHMnXG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHsgYW5hbHl6ZXIgfSBmcm9tICd2aXRlLWJ1bmRsZS1hbmFseXplcidcbmltcG9ydCBkdHMgZnJvbSAndml0ZS1wbHVnaW4tZHRzJ1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xuICBwbHVnaW5zOiBbXG4gICAgZHRzKHtcbiAgICAgIGVudHJ5Um9vdDogJ3NyYycsXG4gICAgICByb2xsdXBUeXBlczogdHJ1ZSxcbiAgICAgIGluY2x1ZGU6IFsnc3JjJ10sXG4gICAgfSksXG4gICAgbm9kZUV4dGVybmFscygpLFxuICAgIHByb2Nlc3MuZW52LkFOQUxZWkVSICYmIGFuYWx5emVyKCksXG4gIF0sXG4gIHNzcjoge1xuICAgIC8vIGJ1bmRsZSBhbmQgdHJlZXNoYWtlIGV2ZXJ5dGhpbmdcbiAgICBub0V4dGVybmFsOiB0cnVlLFxuICB9LFxuICBidWlsZDoge1xuICAgIHNzcjogdHJ1ZSxcbiAgICBsaWI6IHtcbiAgICAgIGVudHJ5OiBbJ3NyYy9pbmRleC50cycsICdzcmMvYmluL2NsaS50cyddLFxuICAgICAgZm9ybWF0czogWydjanMnXSxcbiAgICB9LFxuICAgIHRhcmdldDogJ25vZGUxOCcsXG4gICAgb3V0RGlyOiAnYnVpbGQnLFxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgICBtaW5pZnk6IG1vZGUgPT09ICdwcm9kdWN0aW9uJyAmJiAnZXNidWlsZCcsXG4gIH0sXG59KSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1gsU0FBUyxxQkFBcUI7QUFDOVksU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsT0FBTyxTQUFTO0FBRWhCLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxPQUFPO0FBQUEsRUFDekMsU0FBUztBQUFBLElBQ1AsSUFBSTtBQUFBLE1BQ0YsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsU0FBUyxDQUFDLEtBQUs7QUFBQSxJQUNqQixDQUFDO0FBQUEsSUFDRCxjQUFjO0FBQUEsSUFDZCxRQUFRLElBQUksWUFBWSxTQUFTO0FBQUEsRUFDbkM7QUFBQSxFQUNBLEtBQUs7QUFBQTtBQUFBLElBRUgsWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxNQUNILE9BQU8sQ0FBQyxnQkFBZ0IsZ0JBQWdCO0FBQUEsTUFDeEMsU0FBUyxDQUFDLEtBQUs7QUFBQSxJQUNqQjtBQUFBLElBQ0EsUUFBUTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsUUFBUSxTQUFTLGdCQUFnQjtBQUFBLEVBQ25DO0FBQ0YsRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
