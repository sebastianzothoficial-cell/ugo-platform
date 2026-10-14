#!/usr/bin/env node
/**
 * UGO Pages deploy diagnostics — zero dependencies (Node built-ins only).
 *
 * Answers three questions:
 *   1. Does `base` in vite.config.ts match the repository name / Pages path?
 *   2. Are the references in the *built* index.html (JS/CSS/manifest/SW) absolute and prefixed with that base?
 *   3. Is the deployment path actually complete — artifact path, CI, Pages settings, PWA scope?
 *
 * Usage
 *   node scripts/check-pages-base.mjs                 # static + dist checks
 *   node scripts/check-pages-base.mjs --build         # run `npm run build` first (requires node_modules)
 *   node scripts/check-pages-base.mjs --gh            # query GitHub API for Pages config + CI runs
 *   node scripts/check-pages-base.mjs --live <url>    # HTTP-verify a deployed index.html and every asset
 *   node scripts/check-pages-base.mjs --preview       # start `vite preview` locally and HTTP-verify it
 *   node scripts/check-pages-base.mjs --json          # machine-readable output
 *   node scripts/check-pages-base.mjs --strict        # exit 1 on warnings too (CI gate)
 *
 * Exit codes: 0 = no FAIL, 1 = FAIL (or WARN with --strict), 2 = script error.
 * Docs: docs/github-pages-diagnostic.md
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const has = flag => args.includes(flag)
const opt = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const VALUE_FLAGS = ['--live', '--dist', '--repo']
const BOOLEAN_FLAGS = ['--gh', '--build', '--json', '--strict', '--preview']
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a.startsWith('--') && !BOOLEAN_FLAGS.includes(a) && !VALUE_FLAGS.includes(a)) {
    process.stderr.write(`unknown flag: ${a}  (valid: ${[...BOOLEAN_FLAGS, ...VALUE_FLAGS.map(f => f + ' <value>')].join(', ')})\n`)
    process.exit(2)
  }
  if (!a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]) && !existsSync(path.join(ROOT, a))) {
    process.stderr.write(`unexpected argument: ${a}  (use --dist <dir>, --live <url> or --repo <name>)\n`)
    process.exit(2)
  }
}

const results = []
const add = (id, level, message, hint) => results.push({ id, level, message, hint })
const PASS = (id, m, hint) => add(id, 'PASS', m, hint)
const WARN = (id, m, hint) => add(id, 'WARN', m, hint)
const FAIL = (id, m, hint) => add(id, 'FAIL', m, hint)
const SKIP = (id, m) => add(id, 'SKIP', m)

const read = rel => {
  try { return readFileSync(path.join(ROOT, rel), 'utf8') } catch { return null }
}
const norm = p => (!p || p === '' ? '/' : (p.startsWith('/') ? '' : '/') + p.replace(/\/+$/, '') + '/')
const repoFrom = remote => {
  const parts = String(remote || '').trim().replace(/\.git\/?$/, '').split(/[/@:]+/).filter(Boolean)
  if (parts.length < 2) return null
  const repo = parts[parts.length - 1], owner = parts[parts.length - 2]
  if (!/^[\w.-]+$/.test(repo) || !/^[\w.-]+$/.test(owner)) return null
  return { owner, repo }
}
const run = (cmd, cmdArgs) => {
  try {
    const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8' })
    if (r.error) return null
    return r.status === 0 ? r.stdout : null
  } catch { return null }
}
const fetchText = async (url, { method = 'GET', timeout = 15000 } = {}) => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    let res, finalUrl = url
    for (let hops = 0; hops < 5; hops++) {
      res = await fetch(finalUrl, { method: hops === 0 ? method : 'GET', redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'ugo-pages-doctor' } })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        finalUrl = new URL(res.headers.get('location'), finalUrl).toString()
        continue
      }
      break
    }
    let body = ''
    try { body = await res.text() } catch { /* binary or drained body */ }
    return { status: res.status, body, finalUrl, type: res.headers.get('content-type') || '' }
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) }
  } finally { clearTimeout(timer) }
}
const ghApi = endpoint => {
  const r = spawnSync('gh', ['api', endpoint], { cwd: ROOT, encoding: 'utf8', timeout: 25000 })
  if (r.error || r.status !== 0) return null
  try { return { status: 200, json: JSON.parse(r.stdout) } } catch { return null }
}
const fetchJson = async url => {
  // Sandboxes often MITM TLS or allow only some hosts: prefer the gh CLI when it is authenticated.
  if (url.startsWith('https://api.github.com/')) {
    const viaGh = ghApi(url.replace('https://api.github.com/', ''))
    if (viaGh) return viaGh
  }
  const headers = { accept: 'application/vnd.github+json' }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_REST_TOKEN
  if (token) headers.authorization = `Bearer ${token}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* non-JSON proxy error page */ }
    return { status: res.status, json, text }
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) }
  } finally { clearTimeout(timer) }
}

/* ---------------------------------------------------------------- repo identity */
const origin = run('git', ['config', '--get', 'remote.origin.url']) || ''
const gitRepo = repoFrom(origin)
const pkg = (() => { try { return JSON.parse(read('package.json') || '{}') } catch { return {} } })()
const owner = repoFrom(opt('--repo')?.includes('/') ? opt('--repo') : origin)
const repoName = opt('--repo') || gitRepo?.repo || pkg.name || null
const ciRepo = process.env.GITHUB_REPOSITORY ? repoFrom(process.env.GITHUB_REPOSITORY) : null
const expectedBase = norm(ciRepo?.repo || repoName)
const pagesUrl = owner?.owner && repoName ? `https://${owner.owner}.github.io/${repoName}/` : null
const baseCfg = norm(read('vite.config.ts')?.match(/\bbase\s*:\s*['"]([^'"]*)['"]/)?.[1] || expectedBase)

/* ---------------------------------------------------------------- A. source contract */
const viteRaw = read('vite.config.ts')
if (viteRaw == null) {
  FAIL('A1.config-exists', 'vite.config.ts not found at repo root')
} else {
  const baseMatch = viteRaw.match(/\bbase\s*:\s*['"]([^'"]*)['"]/)
  const base = baseMatch ? baseMatch[1] : null
  if (!baseMatch) {
    FAIL('A1.base-declared', 'no `base:` option in vite.config.ts — Vite defaults to "/" and a project Pages site will 404',
      'add base: process.env.VITE_BASE || "/ugo-platform/" (must equal "/<repo>/" for *.github.io)')
  } else {
    const normalized = norm(base)
    if (normalized === expectedBase) {
      PASS('A1.base-matches-repo', `base "${base}" matches repository "${repoName}" → expected path ${expectedBase}`)
    } else if (normalized === '/') {
      FAIL('A1.base-matches-repo', `base "/" cannot serve a project site: Pages needs ${expectedBase}`,
        `set base: "${expectedBase}" (or deploy to a user/org site / custom domain root)`)
    } else {
      FAIL('A1.base-matches-repo', `base "${base}" ≠ expected ${expectedBase} (repository is "${repoName}")`,
        `the base segment must be the repository name; rename the repo or fix base`)
    }
    if (!base.endsWith('/')) FAIL('A2.base-trailing-slash', `base "${base}" lacks a trailing slash`, 'Vite treats a base without "/" as a prefix-less root; asset URLs become malformed')
    else PASS('A2.base-trailing-slash', `base "${base}" ends with "/"`)
    if (!/^\/[-\w.]+\/$/.test(base)) WARN('A3.base-shape', `base "${base}" is not a simple "/<segment>/" absolute path`, 'relative bases (./) break deep routes and PWA scope on Pages')
  }

  // PWA manifest must agree with base
  const grab = re => viteRaw.match(re)?.[1] ?? null
  const pwaBlock = /VitePWA\s*\(([\s\S]*)/.exec(viteRaw)?.[1] ?? ''
  const pw = re => pwaBlock.match(re)?.[1] ?? viteRaw.match(re)?.[1] ?? null
  const pwa = { id: pw(/\bid:\s*['"]([^'"]*)['"]/), start: pw(/start_url:\s*['"]([^'"]*)['"]/), scope: pw(/scope:\s*['"]([^'"]*)['"]/) }
  const baseNorm = norm(grab(/\bbase\s*:\s*['"]([^'"]*)['"]/))
  if (!/VitePWA/.test(viteRaw)) {
    SKIP('A4.pwa-config', 'VitePWA not configured in vite.config.ts (no manifest/service worker to verify)')
  } else {
    const mismatches = Object.entries(pwa).filter(([, v]) => v && norm(v) !== baseNorm)
    if (mismatches.length) FAIL('A4.pwa-consistency', `PWA ${mismatches.map(([k, v]) => `${k}="${v}"`).join(', ')} ≠ base ${baseNorm}`,
      'scope/start_url outside the Pages subpath makes install + SW registration fail silently')
    else PASS('A4.pwa-consistency', `manifest id/start_url/scope agree with base ${baseNorm}`)
    if (!pwa.scope) WARN('A4.pwa-scope', 'manifest has no explicit scope', 'default scope comes from start_url; be explicit when serving under a subpath')
  }
  if (/sourcemap:\s*true/.test(viteRaw)) WARN('A5.sourcemaps', 'build.sourcemap is true — maps would be published on a public site', 'keep sourcemap: false for Pages')
}

/* ---------------------------------------------------------------- B. source index.html */
const srcIndex = read('index.html')
if (srcIndex == null) {
  FAIL('B1.index-exists', 'index.html not found at repo root')
} else {
  if (/src="\/src\/main\.(t|j)sx?"/.test(srcIndex)) PASS('B2.dev-entry-absolute', 'source entry is "/src/main.tsx" — expected in source, Vite prefixes it with base at build time')
  else FAIL('B2.dev-entry-absolute', 'source entry script is not "/src/main.tsx"', 'a relative "src/main.tsx" breaks the dev server under a base path')
  const hash = /location\.hash|hashchange/.test(read('src/App.tsx') || '')
  if (hash) PASS('B3.hash-routing', 'SPA uses hash navigation, so a direct /#/requests load needs no server rewrite')
  else WARN('B3.hash-routing', 'no hash routing detected under a project Pages URL', 'deep links will 404 unless dist ships a 404.html fallback (see docs/github-pages-diagnostic.md)')
}

/* ---------------------------------------------------------------- C. CI workflow */
const wfFile = (read('README.md')?.match(/`(\.github\/workflows\/[\w.-]+\.ya?ml)`/)?.[1]) || null
const wfRel = wfFile && existsSync(path.join(ROOT, wfFile)) ? wfFile : ['.github/workflows/pages.yml', '.github/workflows/deploy.yml'].find(f => existsSync(path.join(ROOT, f)))
const wf = wfRel ? read(wfRel) : null
if (!wf) {
  FAIL('C1.workflow-exists', 'no Pages workflow found in .github/workflows', 'create build + upload-pages-artifact + deploy-pages jobs')
} else {
  const checks = [
    [/actions\/configure-pages@v\d+/, 'actions/configure-pages present'],
    [/actions\/upload-pages-artifact@v\d+/, 'actions/upload-pages-artifact present'],
    [/actions\/deploy-pages@v\d+/, 'actions/deploy-pages present'],
    [/path:\s*dist/, 'artifact path is `dist`'],
    [/pages:\s*write/, 'permission pages: write'],
    [/needs:\s*build/, 'deploy job depends on build'],
  ]
  const bad = checks.filter(([re]) => !re.test(wf)).map(([, label]) => label)
  if (bad.length) FAIL('C2.workflow-shape', `Pages workflow missing: ${bad.join(', ')}`,
    'Pages with "GitHub Actions" build type serves only what upload-pages-artifact publishes; a missing deploy step leaves the old site (or a 404) in place')
  else PASS('C2.workflow-shape', 'configure-pages → upload-pages-artifact (dist) → deploy-pages chain is complete')

  // Pages settings expect source.path "/" — the artifact root must be dist itself, no dist/<subdir> nesting
  if (/dist\/[\w-]+/.test(wf) && !/path:\s*dist\b/.test(wf)) FAIL('C3.artifact-root', 'artifact path looks nested (dist/<subdir>)', 'Pages serves the artifact root; a nested path adds an extra URL segment')

  const usesNpmCi = /npm\s+ci/.test(wf)
  const lockfile = existsSync(path.join(ROOT, 'package-lock.json'))
  if (usesNpmCi && !lockfile) {
    FAIL('C4.lockfile', 'workflow runs `npm ci` but package-lock.json is not committed', 'commit the lockfile — `npm ci` fails with "The `npm ci` command can only install with an existing package-lock.json"')
  } else if (usesNpmCi && lockfile) {
    PASS('C4.lockfile', 'package-lock.json is committed, `npm ci` can run')
  } else if (!usesNpmCi) {
    WARN('C4.lockfile', 'workflow does not use `npm ci`', 'reproducible Pages builds prefer npm ci + committed lockfile')
  }
  if (/cache:\s*npm/.test(wf) && !lockfile) {
    FAIL('C5.node-cache', 'setup-node has `cache: npm` but package-lock.json is absent', 'actions/setup-node fails the job with "Dependencies lock file is not found"; the Pages deploy never runs')
  } else if (/cache:\s*npm/.test(wf)) {
    PASS('C5.node-cache', 'cache: npm has a lockfile to hash')
  }
  if (/if:\s*github\.event_name\s*!=\s*'pull_request'/.test(wf)) PASS('C6.pr-guard', 'deploy steps are skipped on pull_request events')
  else WARN('C6.pr-guard', 'deploy steps are not guarded against pull_request events', 'a PR would publish a Pages deployment')
}

/* ---------------------------------------------------------------- D. built artifacts */
const distDir = path.resolve(ROOT, opt('--dist') || 'dist')
if (has('--build')) {
  if (!existsSync(path.join(ROOT, 'node_modules'))) WARN('D0.build-skipped', 'cannot run --build: node_modules missing', 'npm install, then re-run')
  else {
    const r = spawnSync('npx', ['--no-install', 'vite', 'build'], { cwd: ROOT, encoding: 'utf8' })
    if (r.status !== 0) FAIL('D0.build', '`vite build` failed — nothing to verify', String(r.stderr || r.stdout || '').split('\n').slice(0, 6).join(' | '))
  }
}
// Service worker topology: VitePWA's generateSW writes dist/sw.js itself, so any hand-written
// public/sw.js is silently replaced, and any other worker is dead code unless it is registered
// (src) or imported by the generated worker (workbox.importScripts).
{
  const v = read('vite.config.ts') || ''
  const generated = /VitePWA/.test(v) && !/registerType:\s*['"]injectManifest['"]/.test(v)
  const swDest = generated ? (v.match(/swDest:\s*['"]([^'"]+)['"]/)?.[1] || 'sw.js') : null
  const swSrc = generated ? (v.match(/swSrc:\s*['"]([^'"]+)['"]/)?.[1] || null) : null
  const isWorker = f => /addEventListener\(\s*['"](install|activate|push|fetch|notificationclick)['"]/.test(read(path.join('public', f)) || '')
  const publicWorkers = existsSync(path.join(ROOT, 'public')) ? readdirSync(path.join(ROOT, 'public')).filter(f => f.endsWith('.js') && isWorker(f)) : []
  const registered = new Set([...(read('src/main.tsx') || '').matchAll(/register\(\s*[`'"]([^`'"]*)[`'"]/g)]
    .map(m => m[1].replace(/\$\{(?:base|import\.meta\.env\.BASE_URL)\}/g, '').replace(/^\//, '')))
  const imported = new Set((v.match(/importScripts:\s*\[([^\]]*)\]/)?.[1] || '')
    .split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).map(x => x.split('/').pop()))
  if (!swDest && !publicWorkers.length) SKIP('D0.sw-topology', 'no service worker involved (no VitePWA, no public/*.js worker)')
  else if (!existsSync(path.join(distDir, 'index.html'))) SKIP('D0.sw-topology', 'cannot compare shipped workers: dist not built yet', 're-run after `npm run build` (or with --build)')
  else {
    const collision = publicWorkers.filter(f => f === swDest && swSrc !== path.join('public', f))
    const orphans = publicWorkers.filter(f => f !== swDest && !registered.has(f) && !imported.has(f))
    if (collision.length) {
      const custom = read(path.join('public', collision[0])) || ''
      const shippedSw = read(path.join(distDir, swDest)) || ''
      const lost = ['push', 'notificationclick'].filter(ev => custom.includes(`"${ev}"`) || custom.includes(`'${ev}'`))
      FAIL('D0.sw-topology', `public/${collision[0]} is overwritten by the Workbox-generated ${swDest} (${shippedSw.length} bytes shipped vs ${custom.length} bytes source)${lost.length ? ` — listeners lost: ${lost.join(', ')}` : ''}`,
        `either point VitePWA at it (injectManifest with swSrc: "public/${collision[0]}") and add the Workbox precache calls yourself, or rename it and register it separately`)
    } else if (orphans.length) {
      FAIL('D0.sw-topology', `${orphans.map(f => `public/${f}${existsSync(path.join(distDir, f)) ? '' : ' (not even copied to dist)'}`).join(', ')} ship(s) but nothing registers or imports it`,
        'register it in src/main.tsx via import.meta.env.BASE_URL, or list it in workbox.importScripts')
    } else if (publicWorkers.length) {
      PASS('D0.sw-topology', `${publicWorkers.map(f => `public/${f}`).join(', ')} all referenced (registered: ${[...registered].join(', ') || '—'}; workbox.importScripts: ${[...imported].join(', ') || '—'})`)
    } else SKIP('D0.sw-topology', `only the generated ${swDest} exists; no hand-written worker to collide with`)
    const injected = existsSync(path.join(distDir, 'registerSW.js'))
    const dup = swDest && registered.has(swDest) && injected
    if (dup) WARN('D1.sw-double-register', `src/main.tsx registers ${baseCfg}${swDest} and VitePWA injects registerSW.js for the same URL`,
      'same scope + URL makes the second call a no-op, but if swDest/swSrc ever change the app registration silently points at the wrong worker')
    else PASS('D1.sw-double-register', 'the generated worker has a single registration path')
  }
}
const built = read(path.relative(ROOT, path.join(distDir, 'index.html')))
if (built == null) {
  SKIP('D1.dist', `dist/index.html not found in ${path.relative(ROOT, distDir) || 'dist'}`, 'run `npm run build` (or pass --build) to check the real Pages artifact')
} else {
  const baseRef = read('vite.config.ts')?.match(/\bbase\s*:\s*['"]([^'"]*)['"]/)?.[1] || expectedBase
  const base = norm(baseRef)
  const refs = []
  for (const m of built.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.push(m[1])
  const sameOrigin = refs.filter(u => u.startsWith('/') && !u.startsWith('//'))
  const external = refs.filter(u => u.startsWith('//') || /^https?:\/\//.test(u))
  const absolute = sameOrigin
  const rootAbsolute = sameOrigin.filter(u => !u.startsWith(base))
  const missing = []
  for (const u of absolute) {
    const rel = u.startsWith(base) ? u.slice(base.length - 1) : null
    if (rel == null) continue
    if (!existsSync(path.join(distDir, rel.replace(/^\//, '')))) missing.push(u)
  }
  if (external.length) WARN('D2.external-refs', `${external.length} cross-origin URL(s) in the document: ${external.slice(0, 3).join(', ')}`, 'fine for a licensed tile host or CDN; unexpected ones bypass the Pages base and the SW cache')
  if (!absolute.length) FAIL('D2.built-refs', 'no same-origin absolute asset URLs found in dist/index.html', 'Vite did not rewrite the entry — check base and that dist is the build output')
  else if (rootAbsolute.length) FAIL('D2.built-refs', `${rootAbsolute.length} asset URL(s) escape the base: ${rootAbsolute.join(', ')}`,
    `every URL must start with ${base} on a project Pages site; fix the source reference or the base`)
  else PASS('D2.built-refs', `${absolute.length} asset URL(s) in dist/index.html are absolute and prefixed with ${base}`)

  if (missing.length) FAIL('D3.files-exist', `referenced but absent from the artifact: ${missing.join(', ')}`,
    'put the file in public/ (or import it) so Vite copies it into dist')
  else PASS('D3.files-exist', `all base-prefixed references resolve to real files under ${path.relative(ROOT, distDir) || 'dist'}`)

  if (/src="\/src\/main\.tsx"/.test(built)) FAIL('D4.dev-leak', 'dist/index.html still references /src/main.tsx (dev-only entry)', 'this dist came from a dev server or a stale build — rebuild before publishing')
  else PASS('D4.dev-leak', 'no dev-only /src/main.tsx reference in the built document')

  const manifestMatch = built.match(/href=["']([^"']*manifest[^"']*)["']/)
  if (!manifestMatch) SKIP('D5.manifest', 'no <link rel="manifest"> in the built document (no PWA to verify)')
  else {
    const manifestFile = path.join(distDir, manifestMatch[1].startsWith(base) ? manifestMatch[1].slice(base.length - 1) : manifestMatch[1])
    let mf = null
    try { mf = JSON.parse(readFileSync(manifestFile, 'utf8')) } catch { /* handled below */ }
    if (!mf) FAIL('D5.manifest', `manifest link ${manifestMatch[1]} is not readable/parseable in dist`, 'VitePWA injects manifest.webmanifest at build time; a missing file means the plugin did not run')
    else {
      const wrong = ['start_url', 'scope', 'id'].filter(k => mf[k] && norm(mf[k]) !== base)
      if (wrong.length) FAIL('D5.manifest', `manifest ${wrong.map(k => `${k}="${mf[k]}"`).join(', ')} ≠ ${base}`, 'an out-of-scope manifest blocks PWA install from the Pages subpath')
      else PASS('D5.manifest', `manifest.webmanifest served at ${manifestMatch[1]} with start_url/scope/id = ${base}`)
      const iconMiss = (mf.icons || []).map(i => i.src).filter(src => src && !existsSync(path.join(distDir, src.replace(/^[/]/, ''))))
      if (iconMiss.length) FAIL('D5.manifest-icons', `manifest icons missing from dist: ${iconMiss.join(', ')}`, 'manifest icon src is resolved against the base; keep the PNGs in public/')
      else if (mf.icons?.length) PASS('D5.manifest-icons', `${mf.icons.length} manifest icon(s) present in dist`)
    }
  }
  const swFile = path.join(distDir, 'sw.js')
  if (existsSync(swFile)) {
    const sw = readFileSync(swFile, 'utf8')
    const urls = [...sw.matchAll(/["']((?:\/[^"'\s]+)+)["']/g)].map(m => m[1]).filter(u => !u.startsWith(base))
    if (urls.length) WARN('D6.sw-urls', `service worker uses root-relative URLs outside base: ${[...new Set(urls)].slice(0, 4).join(', ')}`,
      'notification icons/deep links resolved against the origin root 404 under a project Pages site')
    else PASS('D6.sw-urls', 'service worker URLs are base-prefixed or relative')
  } else SKIP('D6.sw-urls', 'no dist/sw.js (no custom service worker artifact)')
  const wb = readdirSync(distDir, { recursive: true }).map(String).find(f => /^workbox-[\w-]+\.js$/.test(f))
  if (!wb) SKIP('D7.workbox', 'no workbox-*.js in dist (Workbox runtime not emitted)')
  else PASS('D7.workbox', `${wb} shipped next to sw.js (Workbox precache runtime reachable under the same base)`)
}

/* ---------------------------------------------------------------- E. hardcoded base drift */
const srcFiles = []
if (existsSync(path.join(ROOT, 'src'))) {
  const walk = dir => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(rel)
    }
  }
  walk('src')
}
if (existsSync(path.join(ROOT, 'public'))) for (const f of readdirSync(path.join(ROOT, 'public'))) if (f.endsWith('.js')) srcFiles.push(path.join('public', f))
const literal = /[\x27"`](\/[A-Za-z0-9][\w.-]*(?:\/[\w.@-]+)*)\/?[\x27"`]/g
const drift = []
for (const rel of srcFiles) {
  const text = read(rel) || ''
  text.split('\n').forEach((line, n) => {
    if (line.includes('//')) return // URL or comment in that line: Vite never rewrites runtime strings anyway
    for (const m of line.matchAll(literal)) {
      const lit = m[1]
      if (lit === '/' || /^\/(src|assets|node_modules)\//.test(lit)) continue
      drift.push({ rel, line: n + 1, lit, kind: (lit === baseCfg.slice(0, -1) || lit.startsWith(baseCfg)) ? 'hardcoded' : 'root-escape' })
    }
  })
}
const escape = drift.filter(d => d.kind === 'root-escape')
const hardcoded = drift.filter(d => d.kind === 'hardcoded')
if (escape.length) FAIL('E1.root-escape', `${escape.length} runtime string(s) resolve against the origin root instead of the Pages base: ${escape.slice(0, 4).map(d => `${d.rel}:${d.line} "${d.lit}"`).join(', ')}`,
  `Vite prefixes base only in index.html and in module imports — these must become "${baseCfg}…" or a relative URL`)
else PASS('E1.root-escape', 'no runtime asset/notification URL escapes the Pages base')
const filesWithLiterals = [...new Set(hardcoded.map(d => d.rel))]
if (hardcoded.length) WARN('E2.base-literals', `${hardcoded.length} hardcoded "${baseCfg}" string(s) across ${filesWithLiterals.join(', ')}`,
  'they work only while base == repository name; after a rename or a custom-domain root deploy they silently 404. In src/ use import.meta.env.BASE_URL; in public/sw.js (classic worker, no import.meta) use URLs relative to the worker, which Pages serves at ${base}sw.js')
else PASS('E2.base-literals', 'base lives in exactly one place (vite.config.ts)')
/* ---------------------------------------------------------------- F. GitHub Pages state */
const repoSlug = (ciRepo?.owner && ciRepo?.repo) || (owner?.owner && repoName ? `${owner.owner}/${repoName}` : null)
if (!has('--gh')) {
  SKIP('F1.pages-api', 'GitHub API not queried', 'pass --gh to read Pages build_type/source/cname and the last deploy runs')
} else if (!repoSlug) {
  SKIP('F1.pages-api', 'could not resolve owner/repo for the API query')
} else {
  const pages = await fetchJson(`https://api.github.com/repos/${repoSlug}/pages`)
  if (pages.status === 200 && pages.json) {
    const p = pages.json
    const want = `/${repoName}/`
    if (p.cname) {
      WARN('F1.cname', `custom domain "${p.cname}" is configured — Pages serves https://${p.cname}${p.custom_404 ? '' : ' (no custom 404)'}`,
        `with a CNAME the ${want} URL is not the primary site; align base with the domain (usually base: "/") or keep both paths serving the same artifact`)
    } else PASS('F1.cname', `no CNAME — site lives at ${p.html_url}`)
    if (p.public === false) FAIL('F1.visibility', 'Pages site is not public', 'a private Pages plan/billing state returns 404 to anonymous visitors')
    const buildType = p.build_type
    if (buildType === 'workflow') {
      const srcOk = p.source?.branch === 'main' || !p.source
      PASS('F1.build-type', `build_type=workflow (deploy comes from the workflow artifact)${srcOk ? ', source branch main' : ''}`)
    } else if (buildType === 'legacy') {
      FAIL('F1.build-type', `build_type=legacy (serves branch ${p.source?.branch || '?'}:${p.source?.path || '/'})`,
        'the pages.yml artifact is then ignored — set Build and deployment → GitHub Actions, or align base with the legacy path')
    } else WARN('F1.build-type', `build_type=${buildType ?? 'unknown'}`, 'expected "workflow" when deploying from Actions')

    if (p.status && p.status !== 'built') WARN('F1.status', `Pages status=${p.status}`, 'a failed/pending build leaves the previous deployment (or nothing) live')
    else PASS('F1.status', `Pages status=${p.status || 'built'}`)
    if (!p.https_enforced) WARN('F1.https', 'HTTPS not enforced on Pages', 'SW + notification APIs require a secure origin; enable Enforce HTTPS')

    const runs = await fetchJson(`https://api.github.com/repos/${repoSlug}/actions/workflows/${encodeURIComponent(wfRel ? path.basename(wfRel) : 'pages.yml')}/runs?per_page=5`)
    const jobs = runs.status === 200 ? runs.json?.workflow_runs || [] : []
    if (!jobs.length) SKIP('F2.ci-runs', 'no runs found for the Pages workflow (branch/trigger mismatch?)')
    else {
      const latest = jobs[0]
      const failingStep = await (async () => {
        if (latest.conclusion !== 'failure') return null
        const j = await fetchJson(`https://api.github.com/repos/${repoSlug}/actions/runs/${latest.id}/jobs`)
        if (j.status !== 200) return 'log unavailable'
        const steps = j.json.jobs?.flatMap(job => (job.steps || []).filter(s => s.conclusion === 'failure').map(s => `${job.name}: ${s.name}`)) || []
        return steps.join(' | ') || null
      })()
      if (latest.status === 'completed' && latest.conclusion === 'success') PASS('F2.ci-runs', `last Pages workflow run succeeded (${latest.head_sha.slice(0, 7)}, ${latest.updated_at})`)
      else FAIL('F2.ci-runs', `last Pages workflow run ${latest.status}/${latest.conclusion}${failingStep ? ` — failed step: ${failingStep}` : ''}`,
        'with build_type=workflow a failing run means the deployed site is stale or absent; fix CI before blaming base/paths')
    }
  } else if (pages.status === 404) {
    FAIL('F1.pages-api', 'GitHub reports Pages as not enabled for this repository (404)', 'Settings → Pages → Build and deployment → GitHub Actions; until then every path under *.github.io 404s')
  } else {
    SKIP('F1.pages-api', `API unreachable from this environment (${pages.error || pages.status})`, 'github.com/api.github.com may be blocked by the sandbox network policy; run --gh from a normal shell')
  }
}

/* ---------------------------------------------------------------- G. HTTP verification */
let liveUrl = opt('--live')
let previewProc = null
const PREVIEW_PORT = 4321
if (has('--preview')) {
  const busy = await fetchText(`http://127.0.0.1:${PREVIEW_PORT}/`, { timeout: 1500 })
  if (busy.status) WARN('G0.preview', `port ${PREVIEW_PORT} is already answering — verifying that server instead of starting a new one`, 'kill the stale `vite preview` process if it serves an older dist')
  else if (!existsSync(path.join(distDir, 'index.html'))) FAIL('G0.preview', 'cannot preview: no dist/index.html to serve', 'run with --build (or `npm run build`) first')
  else {
    const { spawn } = await import('node:child_process')
    previewProc = spawn('npx', ['--no-install', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT)], { cwd: ROOT, stdio: 'ignore', detached: true })
    const start = Date.now()
    while (Date.now() - start < 25000) {
      const probe = await fetchText(`http://127.0.0.1:${PREVIEW_PORT}${expectedBase}`, { timeout: 2000 })
      if (probe.status === 200 && /id="root"/.test(probe.body || '')) break
      if (previewProc.exitCode !== null) break
      await new Promise(r => setTimeout(r, 600))
    }
    liveUrl = `http://127.0.0.1:${PREVIEW_PORT}${expectedBase}`
  }
}
if (liveUrl) {
  const target = liveUrl.replace(/#.*$/, '')
  const res = await fetchText(target)
  if (!res.status) {
    SKIP('G1.live-index', `GET ${target} failed (${res.error})`, 'the sandbox allows only github.com/api.github.com/registry.npmjs.org — run this check from a machine with browser-level network access, or use --preview')
  } else if (res.status === 404) {
    FAIL('G1.live-index', `404 at ${res.finalUrl}`,
      `Pages serves the artifact root, so the site is only reachable at …${expectedBase}; a 404 there means no successful deploy yet (check F2/C4) — a 404 at the host root is normal for project sites`)
  } else if (res.status >= 300) {
    WARN('G1.live-index', `${res.status} at ${target} → ${res.finalUrl}`, 'follow the redirect manually; Pages redirects are normal for missing trailing slash only')
  } else if (!/id="root"/.test(res.body)) {
    FAIL('G1.live-index', `${res.status} but the body is not the app document`, 'a 200 with an error/landing page usually means the wrong artifact or a custom 404')
  } else {
    PASS('G1.live-index', `${res.status} OK for ${res.finalUrl} with the app mount point`)
    const baseOf = expectedBase
    const urls = [...res.body.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1])
      .filter(u => u.startsWith(baseOf))
    const bad = []
    for (const u of urls) {
      const probe = await fetchText(new URL(u, res.finalUrl).toString(), { method: 'HEAD' })
      let status = probe.status
      if (status === 405 || status === 501) status = (await fetchText(new URL(u, res.finalUrl).toString())).status
      if (status !== 200) bad.push(`${u} → ${status || 'unreachable'}`)
    }
    if (bad.length) FAIL('G2.live-assets', `${bad.length} asset(s) not reachable on the deployed site: ${bad.slice(0, 6).join(', ')}`,
      'usually base mismatch or files left out of the artifact (public/ vs dist)')
    else PASS('G2.live-assets', `${urls.length} deployed asset URL(s) returned 200`)
    const stray = [...res.body.matchAll(/(?:src|href)=["'](\/(?!\/)[^"']*)["']/g)].map(m => m[1]).filter(u => !u.startsWith(baseOf))
    if (stray.length) FAIL('G3.stray-refs', `document references paths outside the Pages base: ${stray.join(', ')}`, 'these are the classic blank-page-on-Pages symptom')
    else PASS('G3.stray-refs', 'no origin-root references in the deployed document')
  }
} else if (!has('--preview')) {
  SKIP('G1.live', 'no HTTP verification requested', 'add --live <url> for the deployed site or --preview for the local artifact')
}
const stopPreview = () => { if (previewProc?.pid) { try { process.kill(-previewProc.pid, 'SIGKILL') } catch { previewProc.kill('SIGKILL') } } }

/* ---------------------------------------------------------------- report */
const order = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 }
results.sort((a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id))
const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 }
for (const r of results) counts[r.level]++

if (has('--json')) {
  process.stdout.write(JSON.stringify({
    repo: repoSlug, pages_url: pagesUrl, base: read('vite.config.ts')?.match(/\bbase\s*:\s*['"]([^'"]*)['"]/)?.[1] ?? null,
    expected_base: expectedBase, counts, results
  }, null, 2) + '\n')
} else {
  const glyph = { PASS: '✓', WARN: '!', FAIL: '✗', SKIP: '–' }
  const color = { PASS: '\x1b[32m', WARN: '\x1b[33m', FAIL: '\x1b[31m', SKIP: '\x1b[90m' }
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR
  const paint = (lvl, s) => useColor ? color[lvl] + s + '\x1b[0m' : s
  console.log(`\nUGO Pages / base-path doctor — repo ${repoSlug || '(unknown)'} · expected base ${expectedBase}`)
  console.log('─'.repeat(96))
  for (const r of results) {
    console.log(`${paint(r.level, `${glyph[r.level]} ${r.level.padEnd(4)}`)} ${r.id.padEnd(22)} ${r.message}`)
    if (r.hint) console.log(`      ${paint('SKIP', '↳ ' + r.hint)}`)
  }
  console.log('─'.repeat(96))
  console.log(`${counts.FAIL} fail · ${counts.WARN} warn · ${counts.PASS} pass · ${counts.SKIP} skip` +
    (pagesUrl ? ` · deployed URL ${pagesUrl}` : ''))
}
stopPreview()
process.exit(counts.FAIL > 0 || (has('--strict') && counts.WARN > 0) ? 1 : 0)
