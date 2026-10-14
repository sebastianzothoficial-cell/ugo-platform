// Renders the real component tree in Node (react-dom/server) so route wiring, i18n plumbing and JSX
// errors are caught without a browser. Network calls happen inside effects, which never run here, so the
// app is exercised in its signed-out and empty-data states.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const entry = `import { renderToStaticMarkup } from 'react-dom/server'
import { I18n } from './src/i18n'
import App from './src/App'
export const render = () => renderToStaticMarkup(<I18n><App/></I18n>)
`
const dir = mkdtempSync(join(tmpdir(), 'ugo-render-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const { outputFiles } = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx', sourcefile: 'smoke-entry.tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
  loader: { '.css': 'empty' },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"https://smoke.invalid"',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_smoke_test"',
    'import.meta.env.VITE_MAP_STYLE_URL': 'undefined',
    'import.meta.env.BASE_URL': '"/ugo-platform/"'
  }
})
const bundlePath = join(dir, 'smoke.cjs')
writeFileSync(bundlePath, outputFiles[0].text)
const { render } = createRequire(join(root, 'package.json'))(bundlePath)

const renderRoute = (hash, locale) => {
  globalThis.location = { hash, origin: 'https://smoke.invalid', href: `https://smoke.invalid/${hash}`, pathname: '/', replace() {}, assign() {} }
  globalThis.localStorage = { getItem: () => locale ?? null, setItem() {}, removeItem() {} }
  const html = render()
  assert.ok(html.length > 300, `${hash} rendered nothing`)
  return html
}
test('every route renders, and private panels stay closed without a session', () => {
  assert.match(renderRoute('#/home'), /Tudo o que você precisa,/)
  assert.match(renderRoute('#/explore'), /placeholder="Buscar serviços ou profissionais"/)
  assert.match(renderRoute('#/auth'), /Boas-vindas à UGO/, 'the sign-in form must be reachable')
  // Auth is still being verified while the first paint happens, so a private route may only show a loader.
  for (const hash of ['#/account', '#/requests', '#/new', '#/professional', '#/admin']) {
    const html = renderRoute(hash)
    assert.match(html, /Carregando\.\.\./, `${hash} must wait for the session instead of guessing`)
    assert.doesNotMatch(html, /Visão geral|Área do profissional|Seus pedidos/, `${hash} leaked a privileged panel`)
  }
  // An unknown hash is not an error page: it has to land on the public home.
  assert.match(renderRoute('#/whatever'), /Tudo o que você precisa,/)
})
test('the whole page follows the stored locale', () => {
  assert.match(renderRoute('#/home', 'es'), /Todo lo que necesitás,/)
  assert.match(renderRoute('#/home', 'en'), /Everything you need,/)
  assert.doesNotMatch(renderRoute('#/home', 'es'), /Tudo o que você precisa/, 'Spanish copy must not leak Portuguese')
})
test('no Supabase secret or admin action reaches the rendered markup', () => {
  for (const hash of ['#/home', '#/explore', '#/admin']) {
    const html = renderRoute(hash)
    assert.doesNotMatch(html, /service_role|eyJ[A-Za-z0-9_-]{20,}\.eyJ/, `${hash} embedded a token`)
    assert.doesNotMatch(html, /apiKey\s*[:=]/, `${hash} embedded a key`)
  }
})
