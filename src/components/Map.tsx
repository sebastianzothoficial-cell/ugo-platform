import { useEffect, useRef } from 'react'
import { Map as LibreMap, NavigationControl, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Provider } from '../lib'
import { useI18n } from '../i18n'
export default function Map({ providers }: { providers: Provider[] }) {
  const node = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  useEffect(() => {
    if (!node.current) return
    const spots = providers.filter(p => p.online && p.disponible && p.lat != null && p.lng != null)
    const first = spots[0]
    const style = import.meta.env.VITE_MAP_STYLE_URL || {
      version: 8 as const, sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }]
    }
    const map = new LibreMap({ container: node.current, style, center: [first?.lng ?? -48.55, first?.lat ?? -27.6], zoom: 11 })
    map.addControl(new NavigationControl(), 'top-right')
    const markers = spots.map(p => {
      const el = document.createElement('div'); el.className = 'map-pin'; el.textContent = '●'; el.title = p.nombre
      return new Marker({ element: el }).setLngLat([p.lng!, p.lat!]).addTo(map)
    })
    return () => { markers.forEach(m => m.remove()); map.remove() }
  }, [providers])
  return <section className="map-wrap"><div ref={node} className="map-canvas" role="img" aria-label={t('map')} /><p className="map-note">{t('mapApprox')}</p></section>
}
