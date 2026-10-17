import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18n } from './i18n'
import App from './App'
import './style.css'

if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    // The offline-shell worker (dist/sw.js) is registered by the registerSW.js script that VitePWA
    // injects into index.html — registering it here as well would be a duplicate. This file only
    // adds the push/notification worker, which shares the base scope so it can also drive the PWA.
    navigator.serviceWorker.register(`${base}push-sw.js`, { scope: base }).catch(() => { /* push notifications unavailable */ })
  })
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18n>
      <App />
    </I18n>
  </React.StrictMode>
)
