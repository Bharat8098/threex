import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests don't load the PWA plugin.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: { VITE_DATA_URL: "/data" },
  },
});
