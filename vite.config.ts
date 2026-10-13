import { defineConfig } from 'vite'
export default defineConfig({
  base: '/ugo-platform/',
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: { chunkSizeWarningLimit: 700 }
})
