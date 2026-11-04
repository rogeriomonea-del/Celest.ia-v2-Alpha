import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Em dev, o motor Python (python3 -m engine.server --port 8787) atende sem o
    // prefixo /api/py — mesmo contrato do nginx em produção.
    proxy: {
      '/api/py': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api\/py/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
