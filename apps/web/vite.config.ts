import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { type Connect, type Plugin, defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const PIPELINE_BUILD = fileURLToPath(new URL("../../pipeline/build", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../fixtures", import.meta.url));
const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".geojson": "application/json",
};

/** Serves a local pipeline build at /data in dev and preview, so the app runs without the
 * published catalogue (`cd pipeline && uv run threex-compile build --out build`). Without a
 * build it serves the synthetic fixture catalogue (three spots) instead. */
function localCatalogue(): Plugin {
  const root = existsSync(join(PIPELINE_BUILD, "v1", "manifest.json")) ? PIPELINE_BUILD : FIXTURES;
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!));
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      return next();
    }
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  };
  return {
    name: "threex-local-catalogue",
    configureServer: (server) => {
      server.config.logger.info(
        `  /data serves ${root === FIXTURES ? "fixtures (no pipeline build)" : "pipeline/build"}`,
      );
      server.middlewares.use("/data", serve);
    },
    configurePreviewServer: (server) => void server.middlewares.use("/data", serve),
  };
}

const DATA_HOST = /^https:\/\/threex-data\.pages\.dev\//;

export default defineConfig({
  plugins: [
    react(),
    localCatalogue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "icons/icon.svg"],
      manifest: {
        name: "ThreeX",
        short_name: "ThreeX",
        description: "Fishing spots near you, and the best time to fish them.",
        lang: "en-IN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f2f2f7",
        theme_color: "#f2f2f7",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/data\//],
        runtimeCaching: [
          {
            // The manifest changes weekly: fresh when online, cached when not.
            urlPattern: ({ url }) => url.pathname.endsWith("/v1/manifest.json"),
            handler: "NetworkFirst",
            options: { cacheName: "threex-manifest", networkTimeoutSeconds: 4 },
          },
          {
            // Tiles and scoring config have content-hashed names: cache forever.
            urlPattern: ({ url }) => /\/v1\/(tiles|scoring)\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "threex-data",
              expiration: { maxEntries: 300, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith("open-meteo.com"),
            handler: "NetworkFirst",
            options: {
              cacheName: "threex-weather",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 12 * 3600, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === "tiles.openfreemap.org",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "threex-basemap",
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 86400, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => DATA_HOST.test(url.href),
            handler: "NetworkFirst",
            options: { cacheName: "threex-data-other", networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  // MapLibre's worker is a separate file (see map/MapView.tsx); pre-bundling would move
  // MapLibre away from it in dev.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: {
    // MapLibre is most of the weight and changes rarely: its own chunk stays cached across app updates.
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: "maplibre", test: /node_modules[\\/]maplibre-gl/ }] },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1" },
});
