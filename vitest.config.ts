import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { thirdPartyNoticesPlugin } from "./scripts/third-party-notices-plugin.mjs";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      dynamicCompileOptions() {
        return { generate: "client" };
      },
    }),
    thirdPartyNoticesPlugin(),
  ],
  resolve: {
    alias: [
      { find: "$lib", replacement: join(root, "src/lib") },
      { find: /^svelte$/, replacement: join(root, "node_modules/svelte/src/index-client.js") },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
