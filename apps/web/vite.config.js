import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// As variáveis VITE_* vêm de .env.<modo> na raiz do monorepo (homolog, production, emulator).
export default defineConfig({
  envDir: '../../',
  build: { outDir: 'dist' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'No Strova',
        short_name: 'No Strova',
        description: 'Planejamento e análise de treino para quem pedala e corre.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b1120',
        theme_color: '#2563eb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // /__/ é reservado ao Firebase Hosting; /api/ será de Functions HTTP.
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
