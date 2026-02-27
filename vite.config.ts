import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: true,      // écoute sur IPv4 + IPv6
    port: 5173,
    strictPort: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["data/tgv_map.json", "data/tgv_map.csv", "data/tgv_issues.csv"],
      manifest: {
        name: "Parc TGV",
        short_name: "Parc TGV",
        description: "Recherche rame ↔ motrices (offline).",
        theme_color: "#111111",
        background_color: "#111111",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});