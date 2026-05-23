import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// We proxy /api to Flask so the browser-side code can just hit '/api/...'
// without worrying about CORS/cookies in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
});
