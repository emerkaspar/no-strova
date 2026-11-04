import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Base pública do site: o og:image precisa de URL absoluta.
const URL_BASE_SITE = 'https://no-strova-app.web.app';

/** Troca %URL_BASE_SITE% no index.html pela constante acima. */
const urlBaseNoHtml = () => ({
  name: 'url-base-no-html',
  transformIndexHtml: (html) => html.replaceAll('%URL_BASE_SITE%', URL_BASE_SITE),
});

// As variáveis VITE_* vêm de .env.<modo> na raiz do monorepo (homolog, production).
export default defineConfig({
  envDir: '../../',
  build: { outDir: 'dist' },
  plugins: [
    urlBaseNoHtml(),
    VitePWA({
      registerType: 'autoUpdate',
      // O manifesto é o public/site.webmanifest (linkado no index.html), não um gerado pelo plugin.
      manifest: false,
      includeAssets: ['favicon.ico', 'site.webmanifest', 'icons/apple-touch-icon.png', 'icons/favicon.svg'],
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
