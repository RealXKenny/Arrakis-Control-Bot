import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    exclude: ["dist/**", "node_modules/**"],
    // `npm run test:load` runs Vitest in soak mode for the longer load run.
    env: mode === "soak" ? { LOAD_SOAK: "1" } : {},
  },
}));
