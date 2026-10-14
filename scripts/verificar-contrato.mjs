// Read-only contract probe for the existing UGO Supabase instance.
//
//   UGO_URL=https://<project>.supabase.co UGO_KEY=<publishable key> node scripts/verificar-contrato.mjs
//
// It uses ONLY the public publishable/anon key, sends no user data (limit 0) and never writes.
// Anything it cannot decide without a session is reported as PENDIENTE, not as a pass: RLS behaviour,
// grants and storage policies are verified in the SQL editor (see docs/VERIFICACION_SUPABASE.md).
const URL_BASE = (process.env.UGO_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = process.env.UGO_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
if (!URL_BASE || !KEY) {
  console.error('Faltan UGO_URL y/o UGO_KEY. Usá solo la clave pública: nunca una service_role.')
  process.exit(2)
}

// Exactly what this front-end reads and calls. If the app changes, this list changes with it — the test
// suite fails otherwise, so the checklist can not silently drift from the code.
const TABLES = {
  usuarios: 'id,nombre,apellido,tipo,activo,email,telefono,zona,pais,fecha_registro',
  perfiles_cliente: 'usuario_id,direccion,ciudad,barrio,telefono,onboarding_completo_at',
  perfiles_proveedor: 'usuario_id,estado_verificacion,online,bio,ciudad_base,categoria_principal_id,experiencia_anos,especialidades,tarifa_base,cpf,pix_tipo,pix_chave,telefono_profesional,termos_aceitos_at,onboarding_paso',
  categorias: 'id,nombre,emoji,slug,activa',
  proveedores_mapa: 'id,nombre,foto_url,karma,servicios_completados,tarifa_base,online,disponible,categoria_nombre,categoria_emoji,categoria_ids,lat,lng,zona,bio,ciudad_base,experiencia_anos,especialidades',
  servicios: 'id,numero,cliente_id,proveedor_id,categoria_id,descripcion,direccion_cliente,estado,tarifa,created_at,programado_para',
  ofertas_servicio: 'id,servicio_id,estado,tarifa_ofrecida,expira_at',
  documentos: 'id,usuario_id,tipo,estado,url_storage',
  evidencias_servicio: 'id,servicio_id,usuario_id,tipo,storage_path,created_at'
}
const RPCS = ['completar_onboarding_cliente', 'guardar_ubicacion_servicio_cliente', 'iniciar_matching', 'iniciar_matching_dirigido', 'cancelar_servicio', 'obtener_ofertas_proveedor', 'aceptar_oferta', 'rechazar_oferta', 'avanzar_servicio', 'marcar_llegada_proveedor', 'activar_disponibilidad_proveedor', 'aprobar_servicio', 'confirmar_pago_efectivo_cliente', 'cash_payment_enabled']

const results = []
const record = (kind, name, status, detail) => { results.push({ kind, name, status, detail }); console.log(`${status.padEnd(9)} ${kind} ${name}${detail ? ` — ${detail}` : ''}`) }

async function get(path, params = {}) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${URL_BASE}${path}${query ? `?${query}` : ''}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
    method: 'GET'
  })
  const body = await response.text()
  return { status: response.status, code: /PGRST\d+/.exec(body)?.[0] || '', body: body.slice(0, 220) }
}

// Unauthenticated: the tables must not be readable at all. A 200 here means RLS or grants are too open.
for (const table of Object.keys(TABLES)) {
  const response = await fetch(`${URL_BASE}/rest/v1/${table}?select=id&limit=0`, { headers: { Prefer: 'count=exact' } })
  if (response.status === 401 || response.status === 403) record('anon', table, 'OK', `sin apikey → ${response.status}`)
  else if (response.ok) record('anon', table, 'FALLO', `${response.status} sin apikey: la tabla está expuesta públicamente`)
  else record('anon', table, 'PENDIENTE', `HTTP ${response.status}`)
}

// With the publishable key but no session: readable = policy open to anon, 401/403 = correct,
// 404 = the relation does not exist, 400 with a column message = schema drift.
for (const [table, columns] of Object.entries(TABLES)) {
  const response = await get(`/rest/v1/${table}`, { select: columns, limit: '0' })
  if (response.status === 404 || response.code === 'PGRST205') record('tabla', table, 'FALLO', 'relación inexistente')
  else if (response.status === 400 && /does not exist|column/.test(response.body)) record('tabla', table, 'FALLO', `columna faltante: ${response.body}`)
  else if (response.status === 401 || response.status === 403) record('tabla', table, 'PENDIENTE', 'requiere sesión autenticada para evaluar RLS')
  else if (response.ok) record('tabla', table, 'REVISAR', 'legible sin JWT: verificá las policies de anon')
  else record('tabla', table, 'PENDIENTE', `HTTP ${response.status}`)
}

// RPC existence: PostgREST answers PGRST202 only when the function is absent or not exposed to `authenticated`.
for (const name of RPCS) {
  const response = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{}' })
  const body = await response.text()
  if (/PGRST202/.test(body)) record('rpc', name, 'FALLO', 'no existe o no está granted a authenticated')
  else record('rpc', name, response.status === 400 || response.status === 401 || response.status === 403 || response.ok ? 'OK' : 'REVISAR', `HTTP ${response.status}`)
}

const failing = results.filter(r => r.status === 'FALLO')
const pending = results.filter(r => r.status === 'PENDIENTE' || r.status === 'REVISAR')
console.log(`\n${results.length - failing.length - pending.length}/${results.length} comprobaciones OK · ${failing.length} fallan · ${pending.length} pendientes de sesión/SQL`)
if (failing.length) console.log('Fallas: ' + failing.map(f => `${f.kind}:${f.name}`).join(', '))
console.log('Las policies RLS por rol, los grants y el Storage se verifican con SQL en docs/VERIFICACION_SUPABASE.md (este script no puede verlos).')
process.exit(failing.length ? 1 : 0)
