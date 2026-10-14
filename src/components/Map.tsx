import { useEffect, useRef, useState } from 'react'
import { Map as LibreMap, NavigationControl, Marker, Popup, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Crosshair, ExternalLink, Compass } from 'lucide-react'
import { money, coordinates, type Provider } from '../lib'
import { useI18n } from '../i18n'

try {
  if (maplibreWorkerUrl) {
    setWorkerUrl(maplibreWorkerUrl)
  }
} catch {
  // Ignore in SSR/non-browser environments
}

export default function Map({ providers, onSelectProvider }: { providers: Provider[]; onSelectProvider?: (p: Provider) => void }) {
  const node = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap | null>(null)
  const { t, locale } = useI18n()
  const [locating, setLocating] = useState(false)
  const [osmUrl, setOsmUrl] = useState('https://www.openstreetmap.org/#map=12/-27.6/-48.55')
  const [mapError, setMapError] = useState(false)

  useEffect(() => {
    if (!node.current) return
    const spots = providers.filter(p => p.online && p.disponible && p.lat != null && p.lng != null)
    const first = spots[0]
    const initialCenter: [number, number] = [first?.lng ?? -48.55, first?.lat ?? -27.6]

    const style = import.meta.env.VITE_MAP_STYLE_URL || {
      version: 8 as const,
      sources: {
        osm: {
          type: 'raster' as const,
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          maxzoom: 19
        }
      },
      layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }]
    }

    let map: LibreMap
    try {
      map = new LibreMap({
        container: node.current,
        style,
        center: initialCenter,
        zoom: 12
      })
      mapRef.current = map
    } catch {
      setMapError(true)
      return
    }

    map.addControl(new NavigationControl({ showCompass: true }), 'top-right')

    map.on('error', e => {
      console.warn('MapLibre error handled:', e?.error?.message || e)
      if (e?.error?.message?.includes('Worker failed') || e?.error?.message?.includes('WebGL')) {
        setMapError(true)
      }
    })

    const updateOsmUrl = () => {
      const c = map.getCenter()
      const z = Math.round(map.getZoom())
      setOsmUrl(`https://www.openstreetmap.org/#map=${z}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`)
    }
    map.on('moveend', updateOsmUrl)
    updateOsmUrl()

    const markers: Marker[] = []
    spots.forEach(p => {
      const el = document.createElement('div')
      el.className = 'interactive-map-pin'
      el.setAttribute('role', 'button')
      el.setAttribute('aria-label', p.nombre)
      el.innerHTML = `<span class="pin-pulse"></span><span class="pin-badge">${p.categoria_emoji || '✦'}</span>`

      const popupNode = document.createElement('div')
      popupNode.className = 'map-popup-card'
      popupNode.innerHTML = `
        <div class="popup-head">
          <div class="popup-avatar">${p.foto_url ? `<img src="${p.foto_url}" alt="${p.nombre}" />` : `<span>${p.nombre?.[0]?.toUpperCase() || 'U'}</span>`}</div>
          <div>
            <strong>${p.nombre}</strong>
            <small>${p.categoria_emoji || ''} ${p.categoria_nombre || ''}</small>
          </div>
        </div>
        <div class="popup-meta">
          <span><span style="color:#e8ab57">★</span> ${p.karma ?? '—'}</span>
          <span>${money(p.tarifa_base, locale)}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="popup-btn" type="button">${t('view')} →</button>
          <a class="popup-osm-link" href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}" target="_blank" rel="noopener noreferrer" title="OpenStreetMap">OSM ↗</a>
        </div>
      `

      popupNode.querySelector('.popup-btn')?.addEventListener('click', () => {
        if (onSelectProvider) onSelectProvider(p)
      })

      const popup = new Popup({ offset: 25, closeButton: false, className: 'ugo-map-popup' }).setDOMContent(popupNode)

      const marker = new Marker({ element: el })
        .setLngLat([p.lng!, p.lat!])
        .setPopup(popup)
        .addTo(map)

      el.addEventListener('click', () => {
        map.easeTo({ center: [p.lng!, p.lat!], zoom: 13.5, duration: 600 })
      })

      markers.push(marker)
    })

    return () => {
      markers.forEach(m => m.remove())
      map.remove()
      mapRef.current = null
    }
  }, [providers, onSelectProvider, t, locale])

  async function centerOnUser() {
    setLocating(true)
    try {
      const p = await coordinates()
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 14, speed: 1.2 })
        const userEl = document.createElement('div')
        userEl.className = 'user-location-marker'
        userEl.innerHTML = '<span class="user-ping"></span><span class="user-dot"></span>'
        new Marker({ element: userEl }).setLngLat([p.lng, p.lat]).addTo(mapRef.current)
      }
    } catch {
      // Ignored if user declines GPS in preview
    } finally {
      setLocating(false)
    }
  }

  if (mapError) {
    return (
      <section className="map-wrap">
        <div className="map-fallback-view">
          <Compass size={32} />
          <p>{t('mapUnavailable')}</p>
          <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="btn btn-dark">
            {t('openMap')} <ExternalLink size={14} />
          </a>
        </div>
      </section>
    )
  }

  return (
    <section className="map-wrap">
      <div className="map-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="map-locate-btn" onClick={centerOnUser} disabled={locating}>
            <Crosshair size={15} /> {locating ? t('loading') : t('myLocation')}
          </button>
          <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="map-osm-btn" title="OpenStreetMap">
            <Compass size={14} /> <span>OpenStreetMap</span> <ExternalLink size={12} />
          </a>
        </div>
        <span className="map-legend-tag">
          <span className="pulse-indicator"></span> {providers.filter(p => p.online && p.disponible).length} {t('online')}
        </span>
      </div>
      <div ref={node} className="map-canvas" role="img" aria-label={t('map')} />
      <div className="map-footer-bar">
        <p className="map-note">{t('mapApprox')}</p>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="osm-attr">
          © OpenStreetMap contributors
        </a>
      </div>
    </section>
  )
}


