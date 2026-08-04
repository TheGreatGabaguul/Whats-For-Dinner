import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // picks up new deploys automatically, no user prompt needed
      includeAssets: ["favicon-32.png", "apple-touch-icon.png"],
      manifest: {
        name: "What's For Dinner",
        short_name: "WFD",
        description: "Rate your grub. Tag your chef. Get famous.",
        start_url: "/",
        display: "standalone",
        background_color: "#FFF4D6",
        theme_color: "#FF5DA2",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Re-check for a new deployed version every time the app regains focus,
        // so people don't get stuck on a stale cached build.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
