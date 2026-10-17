import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/ugo-platform/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'push-sw.js', 'notificationclick-handler.js'],
      manifest: {
        id: '/ugo-platform/',
        name: 'UGO Platform',
        short_name: 'UGO',
        description: 'UGO conecta você aos profissionais certos, perto de você.',
        theme_color: '#183e30',
        background_color: '#f8f7f4',
        display: 'standalone',
        start_url: '/ugo-platform/',
        scope: '/ugo-platform/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // The generated worker is the active registration when push-sw.js is not in control, so it
        // needs the tap handler too; the file ships from public/ (not bundled, not precached).
        importScripts: ['notificationclick-handler.js']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 1100 }
})
