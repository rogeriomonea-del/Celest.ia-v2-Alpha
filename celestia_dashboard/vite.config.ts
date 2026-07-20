import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em dev/preview, /api é proxied para o motor (python -m celestia_engine serve).
// Em produção num domínio único, faça o mesmo no nginx/servidor (ou defina
// VITE_API_URL no build para apontar para a API hospedada em outro domínio).
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
