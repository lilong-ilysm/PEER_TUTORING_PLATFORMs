import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // host is left at Vite's default so the dev server is not exposed on the
    // network unintentionally.
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Amplify Hosting serves this as a static SPA; see amplify.yml for the
    // rewrite rule that routes deep links back to index.html.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
