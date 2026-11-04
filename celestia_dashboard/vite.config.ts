/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    // Server code and pure logic run in node; component tests opt into the
    // browser DOM with a `// @vitest-environment jsdom` first-line comment.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
