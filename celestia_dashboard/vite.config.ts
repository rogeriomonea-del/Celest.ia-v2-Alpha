/// <reference types="vitest" />
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Static pages built as extra Vite inputs and the clean URL each is served at.
 * On Vercel the rewrite lives in vercel.json; this plugin does the same for
 * `vite` (dev) and `vite preview`, so the footer link works everywhere.
 */
const STATIC_PAGES: Record<string, string> = {
  '/privacidade': '/privacidade.html',
}

function cleanUrls(): Plugin {
  const rewrite = (req: { url?: string }) => {
    if (!req.url) return
    const end = req.url.search(/[?#]/)
    const path = end === -1 ? req.url : req.url.slice(0, end)
    const page = STATIC_PAGES[path]
    if (page) req.url = page + (end === -1 ? '' : req.url.slice(end))
  }
  return {
    name: 'celestia:clean-urls',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
  }
}

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export default defineConfig({
  plugins: [react(), cleanUrls()],
  server: {
    host: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        privacidade: page('./privacidade.html'),
      },
    },
  },
  test: {
    // Server code and pure logic run in node; component tests opt into the
    // browser DOM with a `// @vitest-environment jsdom` first-line comment.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
