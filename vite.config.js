import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// RNF-01: entrega como PWA instalável, com service worker para cache
// básico e recebimento de notificações push.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // usamos public/manifest.json próprio (ver arquivo)
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
      devOptions: {
        enabled: true, // permite testar o service worker em `vite dev`
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
