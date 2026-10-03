import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest } from './src/pwa/manifest';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + offline shell. API responses are never cached (personal data).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registration happens in src/pwa/registerServiceWorker.tsx
      includeAssets: ['favicon.svg'],
      manifest: pwaManifest,
      workbox: {
        // Precache only the app shell and the pages that must work offline
        // (attendance entry, QR kiosk). Every other page's code is cached the
        // first time it is opened (runtime rule below), instead of the whole
        // ~9 MB of chunks downloading in the background on first visit.
        globPatterns: [
          'index.html',
          '*.{svg,png,ico,webmanifest}',
          'assets/index-*.{js,css}',
          'assets/vendor-*.js',
          'assets/AttendanceEntry-*.js',
          'assets/QrKioskPage-*.js',
          'assets/*.woff2',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          {
            // Hashed build chunks never change, so a cached copy is always right.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'app-chunks', expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app deploys don't invalidate them, so
        // returning users on slow connections only re-download app code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
