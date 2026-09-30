import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_ORIGIN = process.env['SERVER_ORIGIN'] ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // REST: forwarded with the prefix intact - the server owns /api/* and
      // registers its routes under that prefix, so rewriting it away 404s.
      '/api': {
        target: SERVER_ORIGIN,
        changeOrigin: true,
      },
      // Realtime (Yjs/Hocuspocus) traffic, same process as the API.
      '/collab': {
        target: SERVER_ORIGIN,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
