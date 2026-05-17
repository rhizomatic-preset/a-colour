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
        // Pre-cache the app shell + assets + the Phase-B word encoder
        // (~22 MB quantised ONNX + 1.4 MB embeddings + tokenizer). 30 MB cap
        // handles the largest single file (model_quantized.onnx ≈ 22 MB) with
        // headroom; offline-first means the model must be on-device.
        globPatterns: ["**/*.{js,css,html,svg,woff2,onnx,bin,json,txt}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
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
  optimizeDeps: {
    // @huggingface/transformers ships ONNX runtime + workers + .wasm files via
    // dynamic imports. Vite's pre-bundler chokes on this with a 504. Exclude it
    // so it loads natively in the browser via ESM imports.
    exclude: ["@huggingface/transformers"],
  },
  server: {
    host: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
