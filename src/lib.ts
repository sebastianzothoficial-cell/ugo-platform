import { createClient } from '@supabase/supabase-js'

// The publishable key identifies the existing UGO TEST project. RLS is the authorization boundary.
// No service_role token, payment credential or third-party API secret is bundled into Pages.
export const URL = import.meta.env.VITE_SUPABASE_URL || 'https://tmossnqfwfwjrtzwcbmm.supabase.co'
export const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_meCpkMt79S25M0nHgVv1aQ_V9AMPZEl'
export const db = createClient(URL, KEY, {
  auth: { storageKey: 'ugo-platform-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
export type Role = 'cliente' | 'proveedor' | 'admin' | 'superadmin'
export type Profile = { id: string; nombre: string; apellido: string | null; tipo: Role; activo: boolean; email: string; telefono: string | null; zona: string | null; pais: string | null }
export type Category = { id: string; nombre: string; emoji: string | null; slug: string }
export type Provider = { id: string; nombre: string; foto_url: string | null; karma: number | null; servicios_completados: number; tarifa_base: number | null; online: boolean; disponible: boolean; categoria_nombre: string | null; categoria_emoji: string | null; categoria_ids: string[] | null; lat: number | null; lng: number | null; zona: string | null; bio: string | null; ciudad_base: string | null; experiencia_anos: number | null; especialidades: string | null }
export type Service = { id: string; numero: number; cliente_id: string; proveedor_id: string | null; categoria_id: string | null; descripcion: string | null; direccion_cliente: string | null; estado: string; tarifa: number | null; created_at: string; programado_para: string | null; categoria?: { nombre: string; emoji: string | null } | null }
export type Offer = { id: string; servicio_id: string; estado: string; tarifa_ofrecida: number | null; expira_at: string | null; servicio: { descripcion: string | null; categoria?: { nombre: string; emoji: string | null }; zona_cliente?: string; numero?: number } }
export function errorMessage(value: unknown): string { return value instanceof Error ? value.message : String(value) }
export function money(value: number | null | undefined, locale: string) { return value == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(value) }
export function date(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
export function coordinates(): Promise<{ lat: number; lng: number; accuracy: number; captured: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('GPS indisponível neste dispositivo.')); return }
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: lat, longitude: lng, accuracy } = p.coords
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < .0001 && Math.abs(lng) < .0001) || accuracy > 250 || Date.now() - p.timestamp > 30000) {
        reject(new Error('Precisamos de uma localização recente com precisão de até 250 m. Tente novamente.')); return
      }
      resolve({ lat, lng, accuracy, captured: new Date(p.timestamp).toISOString() })
    }, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  })
}
