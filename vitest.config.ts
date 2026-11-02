import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  // 30s: the first test that imports a server action loads a large module graph, which can pass 5s on a busy machine.
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
