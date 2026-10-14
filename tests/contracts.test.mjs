import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
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
test('request and assignment use canonical owner-scoped Supabase contracts', () => {
  const app = read('src/App.tsx')
  for (const name of ['completar_onboarding_cliente', 'guardar_ubicacion_servicio_cliente', 'iniciar_matching', 'cancelar_servicio', 'obtener_ofertas_proveedor', 'aceptar_oferta', 'rechazar_oferta', 'activar_disponibilidad_proveedor']) assert.ok(app.includes(name), `${name} is missing`)
  assert.match(app, /metadata->>request_draft_id/)
  assert.match(app, /getUser\(\)/)
  assert.match(app, /\.eq\('cliente_id', profile\.id\)/)
  assert.match(app, /\.eq\('proveedor_id', profile\.id\)/)
  assert.match(app, /\['admin', 'superadmin'\]\.includes\(profile\.tipo\)/)
})
test('all three languages are configured and Brazilian Portuguese is default', () => {
  const i18n = read('src/i18n.tsx')
  for (const locale of ['pt-BR', 'es', 'en']) assert.ok(i18n.includes(locale))
  assert.match(i18n, /\? l : 'pt-BR'/)
  assert.match(i18n, /preferred_language/)
})

test('service workers survive the Pages base path without colliding', () => {
  assert.ok(!existsSync(new URL('../public/sw.js', import.meta.url)), 'public/sw.js would be overwritten by the Workbox-generated dist/sw.js')
  assert.match(read('src/main.tsx'), /register\(\s*`\$\{base\}push-sw\.js`/, 'push worker must be registered explicitly')
  assert.match(read('src/main.tsx'), /const base = import\.meta\.env\.BASE_URL/, 'registration URL must follow the Vite base')
  assert.doesNotMatch(read('src/main.tsx'), /register\(`\$\{base\}sw\.js`/, 'the generated worker is registered by the injected registerSW.js only')
  for (const file of ['src/App.tsx', 'src/main.tsx', 'public/push-sw.js', 'public/notificationclick-handler.js']) {
    assert.doesNotMatch(read(file), /['"`]\/ugo-platform\//, `${file} hardcodes the Pages base instead of deriving it`)
  }
})
