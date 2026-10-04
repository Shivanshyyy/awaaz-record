import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// '/' suits Netlify and any root domain; the GitHub Pages workflow sets BASE_PATH=/awaaz-record/.
const base = process.env.BASE_PATH ?? '/';

// Shown on the About screen so that, on a phone, you can tell which build you are looking at.
function gitStamp(): string {
  try {
    return execSync('git describe --always --dirty --abbrev=7', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

// onnxruntime-web references its wasm by URL, so Vite emits a second 21 MB copy; we load it from /ort/ instead.
const dropDuplicateOrtWasm: Plugin = {
  name: 'drop-duplicate-ort-wasm',
  generateBundle(_options, bundle) {
    for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
  },
};

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify({ stamp: gitStamp(), builtAt: new Date().toISOString() }) },
  plugins: [
    react(),
    tailwindcss(),
    dropDuplicateOrtWasm,
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Awaaz Record',
        short_name: 'Awaaz',
        description: 'Offline visit notes for clinic health workers.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the Hindi clip list must be cached too, or offline the app would think no clips exist
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,mp3}', 'audio/hi/manifest.json'],
        // models and onnx runtime files are cached on demand by "Prepare offline mode" (Phase 1)
        globIgnores: ['models/**', 'ort/**'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // A new version waits for the worker to tap "Update", so a deploy can't reload the page and lose a recording.
        skipWaiting: false,
        runtimeCaching: [
          {
            // "Prepare offline mode" is the only writer of this cache; the worker only reads from it.
            // Status -1 never matches, so Workbox serves cache hits but never stores a response itself
            // (two writers raced and replaced our entries with ones that have different headers).
            urlPattern: new RegExp(`${base}(models|ort)/`),
            handler: 'CacheFirst',
            options: { cacheName: 'awaaz-offline-v1', cacheableResponse: { statuses: [-1] } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
