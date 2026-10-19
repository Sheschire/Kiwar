import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png'],
      manifest: {
        name: 'Kiwar',
        short_name: 'Kiwar',
        description: 'A cozy kiwi civilization builder.',
        theme_color: '#c7a6dc',
        background_color: '#f6ead0',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Sounds are fetched on demand (never precached) and kept once heard.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\/audio\/.+\.(ogg|mp3)$/.test(url.pathname) ||
              url.pathname.includes('/storage/v1/object/public/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kiwar-audio',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // Relative paths so the build works from any sub-folder (GitHub Pages, itch.io…).
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          postfx: ['postprocessing', 'n8ao', 'camera-controls'],
        },
      },
    },
  },
});
