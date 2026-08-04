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
      // "injectManifest" em vez do "generateSW" padrão: precisamos de um
      // service worker próprio (src/sw.js) pra reagir a eventos `push` e
      // `notificationclick` (RF-23, RF-24) — o modo automático gera o SW
      // inteiro sozinho e não deixa espaço pra código customizado.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
      devOptions: {
        enabled: true, // permite testar o service worker em `vite dev`
        type: "module",
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
