import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages has no SPA rewrite, so a deep link to /app would 404. Serving the same document
 * as 404.html makes Pages hand those routes back to the client-side router in main.tsx.
 */
function githubPagesSpaFallback(): Plugin {
  return {
    name: "gh-pages-spa-fallback",
    apply: "build",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    githubPagesSpaFallback(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Nullpoint",
        short_name: "Nullpoint",
        description: "Unofficial Sony headphone control — not affiliated with Sony Group Corporation.",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0c0e",
        theme_color: "#0b0c0e",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    port: 5173
  },
  build: {
    target: "es2022"
  }
});
