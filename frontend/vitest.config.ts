import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}", "src/pages/store-admin/Ingredients.stock-intake.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
