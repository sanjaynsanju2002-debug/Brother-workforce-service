import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve(__dirname, "attendance"),
  publicDir: path.resolve(__dirname, "attendance/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-attendance"),
    emptyOutDir: true,
  },
  preview: {
    host: true,
    port: 4174,
    allowedHosts: true,
  },
});
