import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Built pages load nothing from the network, ever. (The dev server needs inline scripts and
// a websocket, so the policy is only added to the production build.)
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'";

function contentSecurityPolicy(): Plugin {
  return {
    name: 'quickcalc-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

// Each Astryx theme's fonts.css loads its typefaces from Google Fonts. QuickCalc bundles the
// same faces instead (src/renderer/fonts.ts), so those files are replaced with nothing; this
// keeps src/astryx-themes.ts exactly as `astryx theme add` generates it.
const THEME_FONTS = /^@astryxdesign\/theme-[\w-]+\/fonts\.css$/;
const NO_FONTS = '\0quickcalc-no-remote-fonts.css';

function offlineThemeFonts(): Plugin {
  return {
    name: 'quickcalc-offline-theme-fonts',
    enforce: 'pre',
    resolveId: (id) => (THEME_FONTS.test(id) ? NO_FONTS : null),
    load: (id) => (id === NO_FONTS ? '' : null),
  };
}

// The renderer (calculator window and settings window). Electron loads the built files
// from disk, so asset paths are relative.
export default defineConfig({
  base: './',
  plugins: [offlineThemeFonts(), react(), contentSecurityPolicy()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome140',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5317,
    strictPort: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
