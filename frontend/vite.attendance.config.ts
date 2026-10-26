import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function attendanceAppIcons(): Plugin {
  const iconDirectory = path.resolve(__dirname, "public/app-icons");
  const iconNames = ["icon-192.png", "icon-512.png", "maskable-512.png"];
  return {
    name: "attendance-app-icons",
    generateBundle() {
      for (const iconName of iconNames) {
        this.emitFile({
          type: "asset",
          fileName: `app-icons/${iconName}`,
          source: readFileSync(path.join(iconDirectory, iconName)),
        });
      }
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, "attendance"),
  publicDir: path.resolve(__dirname, "attendance/public"),
  plugins: [react(), tailwindcss(), attendanceAppIcons()],
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
