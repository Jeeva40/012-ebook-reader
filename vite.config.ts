import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered explicitly from main.tsx via the virtual:pwa-register
      // module instead, so registration success/failure is visible in the
      // app's own code path rather than an auto-injected script tag.
      injectRegister: false,
      manifest: {
        name: 'Book Reader',
        short_name: 'Reader',
        description:
          'Read PDF and EPUB books with highlights saved permanently to your own files.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only: bundled JS/CSS/HTML plus small static assets. The
        // pdf.js worker (pdf.worker.min-*.mjs, ~1.2MB) and the pdfjs public
        // assets (cmaps/standard_fonts/wasm/iccs, ~3.8MB across hundreds of
        // files) are deliberately excluded here — see globIgnores below —
        // and handled by a separate runtime-caching rule instead, so the
        // service worker's install step stays small and fast rather than
        // gating on a multi-megabyte download of assets most sessions never
        // touch (only PDFs need them; EPUB never does).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/pdf.worker*.mjs', 'pdfjs/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Matches both the hashed worker chunk (served from /assets/)
            // and the unhashed cmaps/standard_fonts/wasm/iccs files (served
            // from /pdfjs/). Cache-first: once fetched, pdf.js's own assets
            // for a given deploy never change, so there's no reason to
            // revalidate on every PDF open — that would defeat the point of
            // offline support for exactly the files large enough to matter.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/pdfjs/') || /pdf\.worker.*\.mjs$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-runtime-assets',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
