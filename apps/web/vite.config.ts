import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * En dev (npm run dev) et en aperçu local (npm run preview, LOCAL_PREVIEW=1),
 * le conteneur Docker n'existe pas → l'entrypoint ne fait pas la
 * substitution. On remplace `__BASE_PATH__` par `/` pour que <base href> et
 * /config.js soient résolus correctement. Le build de l'image Docker ne
 * définit pas LOCAL_PREVIEW : le placeholder y reste pour l'entrypoint.
 */
const replaceBasePathDev: Plugin = {
  name: 'replace-base-path-dev',
  apply: (_config, { command }) => command === 'serve' || process.env.LOCAL_PREVIEW === '1',
  transformIndexHtml(html) {
    return html.replace(/__BASE_PATH__/g, '/');
  },
};

/**
 * Identifiant du build, figé au chargement de la config : injecté dans le
 * code (__BUILD_ID__) ET écrit dans dist/version.json. L'app compare les
 * deux au retour au premier plan pour proposer de recharger après une mise
 * en prod (une PWA iOS reprise en arrière-plan garde l'ancien code).
 */
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString();

const emitVersionFile: Plugin = {
  name: 'emit-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
};

export default defineConfig({
  plugins: [react(), replaceBasePathDev, emitVersionFile],

  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },

  // base: './' → URLs d'assets émises relatives. Combinées avec <base href>
  // dans index.html (rempli au runtime par docker-entrypoint.sh), elles
  // résolvent correctement sous n'importe quel sous-chemin (/, /jesuiscoach/...).
  base: './',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  // npm run preview : build de production servi en local (service worker,
  // notifications). localhost est un contexte sécurisé : pas besoin d'HTTPS.
  preview: {
    port: 4173,
    host: true,
  },
});
