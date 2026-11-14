import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts (the app build) so test-only settings
// (jsdom, setup file) never affect `npm run build` / `npm run dev`.
// Node 22.4+ has its own localStorage, which hides jsdom's, so tests that
// use it fail (from Node 25, where it's on by default). Turn it off where
// Node knows the flag; Node 20 (CI) doesn't, and would refuse to start.
const execArgv = process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  plugins: [react()],
  test: {
    poolOptions: {
      forks: { execArgv },
      threads: { execArgv },
    },
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Only our own tests — without this, Vitest's default glob also picks up
    // unrelated *.test.ts fixtures cached by other tools (e.g. .trunk/).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
