import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: '/ugo-platform/',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 1100 }
})
