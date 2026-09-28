import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Several suites import large route/module graphs or scan src/ inside a test. Alone they take
    // well under a second, but a loaded machine (parallel workers, a dev server, Docker) has pushed
    // them past the 5s default. The limit only bounds hangs; it does not change any assertion.
    testTimeout: 20_000,
  },
});
