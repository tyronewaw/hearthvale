import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// VITE_BASE is set by the Pages workflow (e.g. /hearthvale/). Locally the game is served from /.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rolldownOptions: {
      // The 2D prototype is kept as a playable design reference at /legacy/.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        legacy: resolve(import.meta.dirname, 'legacy/index.html'),
      },
    },
  },
  server: { host: true },
  plugins: [
    // Installable, and playable offline once loaded (game code, Rapier's WASM, the font, the prototype).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Hearthvale',
        short_name: 'Hearthvale',
        description: 'A cosy god game: shape a little round world, guide your tribe with your hand and raise a god pet.',
        theme_color: '#5b3a26',
        background_color: '#a9d8f2',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,webmanifest}'],
        // Rapier's WASM is inlined in its JS chunk (~2 MB), so allow big files in the precache.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // /legacy/ is its own page, not the 3D game's fallback.
        navigateFallbackDenylist: [/\/legacy\//],
      },
    }),
  ],
});
