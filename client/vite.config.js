import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the UI and API are separate origins. Proxying /api keeps
    // the frontend code identical to production, where one process serves both.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // The force-graph bundle is large and unavoidable; raising the warning
    // threshold stops a known, accepted size from looking like a regression.
    chunkSizeWarningLimit: 1200,
  },
});
