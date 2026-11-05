import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { maxWorkers: 2, testTimeout: 15000, environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
