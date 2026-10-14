import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map as LibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { osmLink, type Provider } from '../lib'
import { useI18n } from '../i18n'
type Spot = Provider & { lat: number; lng: number }
// Approximate positions only: `proveedores_mapa` publishes jittered coordinates, never a private GPS fix.
const spotsFor = (providers: Provider[]): Spot[] => providers.filter((p): p is Spot => p.online && p.disponible && p.lat != null && p.lng != null)
export default function Map({ providers }: { providers: Provider[] }) {
  const node = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap | null>(null)
  const markers = useRef<Marker[]>([])
  const framed = useRef(false)
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  // The map is created once: provider refreshes (realtime, filters, retry) only move the markers, so tiles
  // and the user's own pan/zoom survive. WebGL-less or blocked-tile devices fall back to a link.
  useEffect(() => {
    if (!node.current) return
    const style = import.meta.env.VITE_MAP_STYLE_URL || {
      version: 8 as const, sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }]
    }
    try {
      const map = new LibreMap({ container: node.current, style, center: [-48.55, -27.6], zoom: 11 })
      map.addControl(new NavigationControl(), 'top-right')
      mapRef.current = map
    } catch { setFailed(true) }
    return () => { markers.current.forEach(m => m.remove()); markers.current = []; mapRef.current?.remove(); mapRef.current = null; framed.current = false }
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const spots = spotsFor(providers)
    markers.current.forEach(m => m.remove())
    markers.current = spots.map(p => {
      const el = document.createElement('div')
      el.className = 'map-pin'
      el.textContent = '●'
      el.title = p.nombre
      el.setAttribute('aria-label', `${p.nombre} — ${p.zona || p.ciudad_base || ''}`.trim())
      return new Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map)
    })
    if (framed.current || !spots.length) return
    const frame = () => {
      const bounds = new LngLatBounds()
      spots.forEach(p => bounds.extend([p.lng, p.lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 })
      framed.current = true
    }
    if (map.isStyleLoaded()) frame()
    else map.once('load', frame)
  }, [providers])
  const first = spotsFor(providers)[0]
  if (failed) return <section className="map-wrap"><p className="map-fallback">{t('mapUnavailable')} <a href={osmLink(first?.lat ?? null, first?.lng ?? null)} target="_blank" rel="noopener noreferrer">{t('openMap')}</a></p></section>
  return <section className="map-wrap"><div ref={node} className="map-canvas" role="img" aria-label={t('map')} /><p className="map-note">{t('mapApprox')}</p></section>
}
