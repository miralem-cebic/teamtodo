import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileProtocol } from './build/fileProtocol.ts';

// Produktions-Build muss per Doppelklick (file://) in Chrome/Edge laufen:
// ein einziges klassisches IIFE-Skript, relative Pfade, kein Code-Splitting.
export default defineConfig({
  base: './',
  plugins: [react(), fileProtocol()],
  build: {
    target: 'chrome120',
    modulePreload: false,
    cssCodeSplit: false,
    // Schriften als data:-URL einbetten, damit unter file:// kein Font-Request nötig ist
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? true : undefined),
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
