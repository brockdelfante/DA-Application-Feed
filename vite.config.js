import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.VITE_OPENROUTER_API_KEY ?? '';

  return {
    base: '/Vocal-Aligner/',
    // Inject the API key as a global so Web Workers can access it
    // (workers cannot read import.meta.env directly)
    define: {
      'self.__VITE_OPENROUTER_API_KEY__': JSON.stringify(apiKey)
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt'],
        manifest: {
          name: 'Vocal Restructurer',
          short_name: 'VocalAI',
          description: 'AI-powered vocal restructuring PWA',
          theme_color: '#1a1a2e',
          background_color: '#1a1a2e',
          display: 'standalone',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/huggingface\.co\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ai-models-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            },
            {
              urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ai-models-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            },
            {
              urlPattern: /^https:\/\/openrouter\.ai\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'api-cache' }
            }
          ]
        }
      })
    ],
    worker: {
      format: 'es'
    },
    optimizeDeps: {
      exclude: ['@xenova/transformers', 'onnxruntime-web']
    },
    assetsInclude: ['**/*.wasm'],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov']
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            transformers: ['@xenova/transformers'],
            tone: ['tone'],
            meyda: ['meyda'],
            jszip: ['jszip']
          }
        }
      }
    }
  };
});
