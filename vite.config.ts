/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons.svg", "pwa.svg"],
      workbox: {
        // Pre-cache the app shell + the CSV. ~1MB cap covers it comfortably.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 2_000_000,
      },
      manifest: {
        name: "Colour Thesaurus",
        short_name: "Colour",
        description: "Pick a colour, see the closest named matches.",
        theme_color: "#111010",
        background_color: "#f2ede6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/pwa.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
