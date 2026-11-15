import { defineConfig } from 'vite';
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
});
