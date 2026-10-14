import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const i18nSource = () => read('src/i18n.tsx')
// The dictionary is a plain object literal, so the tests can read it without a bundler.
const dictionary = () => {
  const source = i18nSource()
  const start = source.indexOf('const words = {') + 'const words = '.length
  return new Function(`return ${source.slice(start, source.indexOf('} as const') + 1)}`)()
}
const statusLabels = () => {
  const source = i18nSource()
  const block = source.slice(source.indexOf('serviceStatusKeys'), source.indexOf('export function serviceStatusLabel'))
  return Object.fromEntries([...block.matchAll(/(\w+): '(\w+)'/g)].map(m => [m[1], m[2]]))
}
const SERVICE_ESTADOS = ['borrador', 'buscando', 'ofrecido', 'asignado', 'en_camino', 'llegado', 'en_progreso', 'esperando_aprobacion', 'completado', 'cancelado', 'disputado']
test('Vite and Pages publish at the same repository base', () => {
  assert.match(read('vite.config.ts'), /base:\s*['"]\/ugo-platform\/['"]/)
  assert.match(read('.github/workflows/pages.yml'), /branches: \[main\]/)
  assert.match(read('.github/workflows/pages.yml'), /actions\/deploy-pages@v4/)
  assert.match(read('index.html'), /src="\/src\/main.tsx"/)
})
test('only publishable credentials are referenced by the browser, no private key', () => {
  for (const file of readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(f => /\.(ts|tsx)$/.test(f))) {
    const source = read(`src/${file}`)
    assert.doesNotMatch(source, /(?:import\.meta\.env\.|process\.env\.)(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|OPENAI_API_KEY|MERCADO_PAGO_ACCESS_TOKEN)/, file)
  }
  assert.match(read('src/lib.ts'), /VITE_SUPABASE_PUBLISHABLE_KEY/)
})
const sourceTree = () => readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(f => /\.(ts|tsx)$/.test(f)).map(f => read(`src/${f}`)).join('\n')
test('request and assignment use canonical owner-scoped Supabase contracts', () => {
  const app = sourceTree()
  for (const name of ['completar_onboarding_cliente', 'guardar_ubicacion_servicio_cliente', 'iniciar_matching', 'cancelar_servicio', 'obtener_ofertas_proveedor', 'aceptar_oferta', 'rechazar_oferta', 'activar_disponibilidad_proveedor']) assert.ok(app.includes(name), `${name} is missing`)
  assert.match(app, /metadata->>request_draft_id/)
  assert.match(app, /getUser\(\)/)
  assert.match(app, /\.eq\('cliente_id', profile\.id\)/)
  assert.match(app, /\.eq\('proveedor_id', profile\.id\)/)
  assert.match(app, /\['admin', 'superadmin'\]\.includes\(profile\.tipo\)/)
})
test('all three languages are configured and Brazilian Portuguese is default', () => {
  const i18n = i18nSource()
  for (const locale of ['pt-BR', 'es', 'en']) assert.ok(i18n.includes(locale))
  assert.match(i18n, /\? l : 'pt-BR'/)
  assert.match(i18n, /preferred_language/)
  assert.match(i18n, /document\.title = `UGO — \$\{words\[locale\]\.tagline\}`/, 'the browser tab must follow the selected language')
})
test('every locale carries the same non-empty keys', () => {
  const words = dictionary()
  assert.deepEqual(Object.keys(words).sort(), ['en', 'es', 'pt-BR'])
  const reference = Object.keys(words['pt-BR'])
  for (const [locale, entries] of Object.entries(words)) {
    assert.deepEqual(Object.keys(entries).sort(), [...reference].sort(), `${locale} key set differs from pt-BR`)
    for (const [key, value] of Object.entries(entries)) assert.ok(typeof value === 'string' && value.trim(), `${locale}.${key} is empty`)
  }
})
test('no translation key is left unused', () => {
  const source = i18nSource()
  const code = sourceTree().replace(/const words[\s\S]*\} as const/, '')
  const used = new Set([...code.matchAll(/'([a-zA-Z][\w-]*)'/g).map(m => m[1]), ...code.matchAll(/words\[[^\]]+\]\.(\w+)/g).map(m => m[1])])
  for (const key of Object.values(statusLabels())) used.add(key)
  const dead = Object.keys(dictionary()['pt-BR']).filter(key => !used.has(key))
  assert.deepEqual(dead, [], 'unused copy keys must be wired up or removed')
})
test('every service status is labelled and styled, never shown as raw database text', () => {
  const labels = statusLabels()
  const words = dictionary()
  const flow = read('src/flow.ts')
  const arrays = [...flow.matchAll(/export const (?:MATCHING_STATES|CANCELLABLE_STATES) = \[([^\]]*)\]/g)].flatMap(m => m[1].split(',').map(v => v.replace(/['\s]/g, '')).filter(Boolean))
  const transitions = Object.entries(Object.fromEntries([...flow.slice(flow.indexOf('PROVIDER_NEXT'), flow.indexOf('export const MATCHING_STATES')).matchAll(/(\w+): '(\w+)'/g)].map(m => [m[1], m[2]])))
  const referenced = [...SERVICE_ESTADOS, ...arrays, ...transitions.flat()]
  assert.ok(arrays.length === 7, `the state lists must stay readable by this test, found ${arrays.length}`)
  assert.deepEqual(transitions, [['asignado', 'en_camino'], ['en_camino', 'llegado'], ['llegado', 'en_progreso'], ['en_progreso', 'esperando_aprobacion']], 'provider transitions must match private.avanzar_servicio_impl')
  for (const estado of referenced) {
    const key = labels[estado]
    assert.ok(key, `${estado} has no localized label`)
    for (const [locale, entries] of Object.entries(words)) assert.ok(String(entries[key]).trim(), `${estado} label is empty in ${locale}`)
    assert.match(read('src/style.css'), new RegExp(`\\.status-${estado}[,{:]`), `${estado} pill has no style`)
  }
  const app = sourceTree()
  assert.match(app, /serviceStatusLabel\(row\.estado, t\)/)
  assert.match(app, /serviceStatusLabel\(j\.estado, t\)/)
  assert.doesNotMatch(read('src/App.tsx'), /estado\.replaceAll\(/, 'statuses must not be rendered with raw underscores')
  // `ejecutando` and `confirmado` are not part of public.servicio_estado: sending them made the provider step
  // fail with an invalid enum value, and closing the service belongs to the client anyway.
  for (const invented of ['ejecutando', 'confirmado']) assert.doesNotMatch(app, new RegExp(`'${invented}'`), `${invented} is not a real servicio_estado`)
})
test('mutations go through the verified flow module', () => {
  const app = read('src/App.tsx')
  for (const name of ['iniciar_matching', 'cancelar_servicio', 'aceptar_oferta', 'rechazar_oferta', 'avanzar_servicio', 'marcar_llegada_proveedor', 'guardar_ubicacion_servicio_cliente']) assert.ok(!app.includes(`db.rpc('${name}'`), `${name} must run through src/flow.ts so the persisted state is verified`)
  assert.doesNotMatch(app, /from\('servicios'\)\.insert/, 'only publishOrder may create a service row')
  for (const name of ['publishOrder', 'resumeMatching', 'cancelOrder', 'respondOffer', 'advanceService', 'registerEvidence']) assert.ok(app.includes(`${name}(`), `${name} is not wired into the UI`)
  assert.match(app, /sessionStorage\.removeItem\(storageKey\)/, 'the draft key is dropped only once the order is confirmed')
  assert.match(app, /\? t\('verifiedByState'\)/, 'a recovered action that the database confirms must say so')
})
test('the map degrades to an OpenStreetMap link instead of a blank panel', () => {
  const map = read('src/components/Map.tsx')
  assert.match(map, /try \{[\s\S]*?new LibreMap/, 'map creation must be guarded')
  assert.match(map, /setFailed\(true\)/)
  assert.match(map, /t\('mapUnavailable'\)/)
  assert.match(map, /t\('openMap'\)/)
  assert.match(map, /osmLink\(/)
  assert.match(map, /markers\.current\.forEach\(m => m\.remove\(\)\)/, 'markers must be cleaned up before re-adding')
  assert.match(read('src/App.tsx'), /<Boundary fallback=\{<p className="map-fallback">\{t\('mapUnavailable'\)/)
  assert.match(read('src/lib.ts'), /export function osmLink/)
})
test('the provider dialog closes with Escape and returns focus to the list', () => {
  const app = read('src/App.tsx')
  assert.match(app, /if \(event\.key === 'Escape'\) setProvider\(null\)/)
  assert.match(app, /aria-modal="true"/)
  assert.match(app, /tabIndex=\{-1\}/)
  assert.match(app, /focused\?\.focus\(\)/)
  assert.match(read('src/style.css'), /\.modal-open\{overflow:hidden\}/)
})
test('draft identifiers work outside secure contexts', () => {
  const lib = read('src/lib.ts')
  assert.match(lib, /export function uid\(\): string \{/)
  assert.match(lib, /crypto\.randomUUID === 'function'/)
  assert.match(lib, /getRandomValues/)
  assert.doesNotMatch(read('src/App.tsx'), /crypto\.randomUUID\(\)/)
  assert.match(read('src/App.tsx'), /draftId = uid\(\)/)
})
test('uid() stays RFC-4122 shaped when crypto.randomUUID is missing', () => {
  const lib = read('src/lib.ts')
  const start = lib.indexOf('export function uid')
  const signature = 'function uid() {'
  const body = lib.slice(start, lib.indexOf('\n}', start) + 2).replace(/export function uid\(\): string \{/, signature)
  assert.ok(body.startsWith(signature), 'uid() signature changed; update this extraction')
  const build = new Function('crypto', `${body}; return uid`)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  // A deterministic fill keeps the assertion on the version / variant nibbles, not on randomness.
  const fill = seed => ({ getRandomValues: bytes => { for (let i = 0; i < bytes.length; i++) bytes[i] = (seed + i * 17) % 256; return bytes } })
  const first = build(fill(0))()
  assert.match(first, uuid)
  assert.notEqual(first, build(fill(1))())
  assert.equal(build({ randomUUID: () => 'native-id', getRandomValues: () => { throw new Error('unused') } })(), 'native-id', 'the native generator must win when available')
})
test('the map fallback keeps the approximate position only', () => {
  const lib = read('src/lib.ts')
  const start = lib.indexOf('export function osmLink')
  const signature = 'function osmLink(lat, lng) {'
  const body = lib.slice(start, lib.indexOf('\n}', start) + 2).replace(/export function osmLink\([^)]*\): string \{/, signature)
  assert.ok(body.startsWith(signature), 'osmLink() signature changed; update this extraction')
  const osmLink = new Function(`return ${body}`)()
  assert.equal(osmLink(-27.5954, -48.548), 'https://www.openstreetmap.org/?mlat=-27.5954&mlon=-48.548#map=14/-27.5954/-48.548')
  assert.equal(osmLink(null, null), 'https://www.openstreetmap.org')
  assert.equal(osmLink(0, null), 'https://www.openstreetmap.org', 'a coordinate is only useful as a pair')
})
test('private lists refresh when the tab becomes visible again', () => {
  const app = read('src/App.tsx')
  assert.match(app, /function useRefreshOnVisible\(/)
  assert.equal((app.match(/useRefreshOnVisible\(load\)/g) || []).length, 2, 'the client and provider dashboards must both refresh')
})

test('the P0 verification harness covers every object the app actually depends on', () => {
  const probe = read('scripts/verificar-contrato.mjs')
  const doc = read('docs/VERIFICACION_SUPABASE.md')
  const src = sourceTree()
  const used = new Set([...src.matchAll(/\.from\('([a-z_]+)'\)/g)].map(m => m[1]))
  const rpcCalls = [...src.matchAll(/rpc\(\s*db,?\s*'([a-z_]+)'/g), ...src.matchAll(/db\.rpc\('([a-z_]+)'/g)]
  const rpcs = new Set(rpcCalls.map(m => m[1]))
  assert.ok(used.size >= 9, `esperaba al menos las 9 tablas del flujo, vi ${used.size}`)
  for (const table of used) assert.ok(probe.includes(`${table}:`), `la sonda no cubre la tabla ${table}`)
  assert.ok(rpcs.size >= 8, `se esperaban las RPCs del flujo, hay ${rpcs.size}`)
  // Las dos de decisión comparten llamada, así que no aparecen como literal junto a rpc(db, …).
  for (const name of ['aceptar_oferta', 'rechazar_oferta']) {
    assert.ok(src.includes(`'${name}'`), `el flujo debe llamar ${name}`)
    rpcs.add(name)
  }
  for (const name of rpcs) assert.ok(probe.includes(`'${name}'`), `la sonda no cubre la RPC ${name}`)
  // El documento debe dejar claro qué NO se pudo verificar y cómo se comprueba RLS/Storage.
  assert.match(doc, /No ejecutable/)
  assert.match(doc, /relrowsecurity|rls_enabled/)
  assert.match(doc, /service-evidence/)
  assert.match(doc, /provider-kyc/)
  assert.match(doc, /servicio_estado/)
  // Y la sonda no puede usar una clave privada bajo ningún punto.
  assert.ok(!/service_role|SERVICE_ROLE/.test(probe.replace(/nunca una service_role|no una service_role/g, '')), 'la sonda no debe tocar una service_role')
})

test('a retry reuses the draft only while the request is unchanged', () => {
  const app = read('src/App.tsx')
  const submit = app.slice(app.indexOf('const storageKey'), app.indexOf('const result = await publishOrder'))
  assert.match(submit, /sessionStorage\.getItem\(storageKey\)/, 'el rastro debe leerse antes de insertar')
  assert.match(submit, /-fp`\) !== fingerprint/, 'un pedido editado no puede recuperar el rastro anterior')
  assert.match(app, /removeItem\(storageKey\); sessionStorage\.removeItem\(`\$\{storageKey\}-fp`\)/, 'al confirmar se sueltan ambos rastros')
})
