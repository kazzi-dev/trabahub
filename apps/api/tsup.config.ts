import { defineConfig } from "tsup";

// Bundles the API and the workspace's shared package into dist/server.js; npm packages stay external.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  noExternal: ["@trabahub/shared"],
});
