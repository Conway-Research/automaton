import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["src/__tests__/offline-setup.ts", "src/__tests__/native-coverage.ts"],
    testTimeout: 30_000,
    teardownTimeout: 5_000,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/types.ts",
        "node_modules/**",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 55,
        lines: 60,
      },
      reporter: ["text", "text-summary", "json-summary"],
    },
  },
});
