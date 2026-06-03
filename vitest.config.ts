import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // The pure-logic modules under test (tailor/schemas.ts, render/ats.ts)
      // start with `import "server-only"`, which throws outside an RSC server
      // context. Alias it to an empty module so the imports load under vitest.
      "server-only": fileURLToPath(
        new URL("./test/shims/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
});
