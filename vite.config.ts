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
      includeAssets: ["favicon.svg"],
      workbox: {
        // Pre-cache the app shell + small assets. The Phase-B word encoder
        // (~22 MB ONNX + 1.5 MB embeddings + ~700 KB tokeniser) is *not*
        // precached — mobile users would otherwise pay the download even if
        // they never open Word mode. It is runtime-cached on first fetch via
        // the rules below, so users who opt in still get full offline
        // support on subsequent loads.
        globPatterns: ["**/*.{js,css,html,svg,woff2,json,txt}"],
        globIgnores: ["**/word-encoder/**", "**/colour-embeddings.bin"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // ONNX model, tokeniser, config — only fetched when the user
            // enters Word mode with Smart matching enabled.
            urlPattern: /\/word-encoder\/.+$/,
            handler: "CacheFirst",
            options: {
              cacheName: "word-encoder-v1",
              expiration: { maxEntries: 32 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /\/colour-embeddings\.bin$/,
            handler: "CacheFirst",
            options: {
              cacheName: "word-encoder-v1",
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Colour Thesaurus",
        short_name: "Colour",
        description: "Pick a colour, or type a word to get the closest named matches.",
        theme_color: "#111010",
        background_color: "#f2ede6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
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
  build: {
    // Emit production source maps so DevTools and Lighthouse can attribute
    // bytes and stack traces. Browsers only fetch .map files when DevTools is
    // open, so this doesn't affect end-user payload.
    sourcemap: true,
  },
  server: {
    host: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
