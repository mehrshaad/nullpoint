import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Taken from package.json rather than typed into the About panel, where it sat a release out
// of date without anyone noticing.
const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

/**
 * GitHub Pages has no SPA rewrite. Emitting the document at /app/index.html means that route
 * is served with a real 200 (Pages redirects /app to /app/ for directories); 404.html is kept
 * as a catch-all for any other path, which renders correctly even though the status is 404.
 */
function githubPagesRoutes(): Plugin {
  return {
    name: "gh-pages-routes",
    apply: "build",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      const index = resolve(dist, "index.html");
      copyFileSync(index, resolve(dist, "404.html"));
      mkdirSync(resolve(dist, "app"), { recursive: true });
      copyFileSync(index, resolve(dist, "app", "index.html"));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    githubPagesRoutes(),
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
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173
  },
  build: {
    target: "es2022"
  }
});
