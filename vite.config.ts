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

// The renderer (calculator window and settings window). Electron loads the built files
// from disk, so asset paths are relative.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
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
