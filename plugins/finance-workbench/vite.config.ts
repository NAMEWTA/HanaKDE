
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ui', 'Panel.tsx'),
      formats: ['es'],
      fileName: () => 'panel.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith('.css') ? 'panel.css' : '[name][extname]',
      },
    },
  },
});
