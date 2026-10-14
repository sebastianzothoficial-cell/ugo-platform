# GitHub Pages deployment path — diagnostic guide

Scope: verifying that this SPA is reachable at the Pages **subdirectory** it is built for, and that
`dist/index.html` points at assets that actually exist there. It covers the three links in the chain:

```
repository name ──► vite.config.ts `base` ──► built index.html URLs ──► Pages serves the same path
       (A)                  (A)                       (D)                       (F/G)
```

A break at any one of them produces the same visible symptom: **blank page** (white `<div id="root">`,
404s in the Network tab) or **404 at the site URL**.

---

## 1. One command

```sh
node scripts/check-pages-base.mjs              # A + B + C + D + E (no network, no node_modules needed)
node scripts/check-pages-base.mjs --build      # rebuilds dist first, then verifies the real artifact
node scripts/check-pages-base.mjs --preview    # serves dist/ locally and HTTP-probes every asset URL
node scripts/check-pages-base.mjs --gh         # reads Pages settings + last deploy runs from GitHub
node scripts/check-pages-base.mjs --live https://sebastianzothoficial-cell.github.io/ugo-platform/
npm run check:pages -- --gh --build --strict   # same, via npm, failing the shell on any FAIL
```

Exit codes: `0` clean, `1` at least one `FAIL` (or any `WARN` with `--strict`), `2` bad arguments.
The script uses Node built-ins only, so it also runs in a fresh clone with no `node_modules`
(`D` reports `SKIP` there instead of guessing).

This is what `main` reports (2026-10-14, at `1360d93`):

| id | level | finding |
|---|---|---|
| `A1` | PASS | `base: '/ugo-platform/'` == repository `ugo-platform` |
| `A4` | PASS | manifest `id` / `start_url` / `scope` all equal `/ugo-platform/` |
| `B2` | PASS | source entry is `/src/main.tsx` (correct: dev-only, Vite prefixes it at build) |
| `C2` | PASS | `configure-pages → upload-pages-artifact(path: dist) → deploy-pages` chain complete |
| `C4`/`C5` | PASS | `npm ci` + `cache: npm` have a committed lockfile *(see caveat in §7)* |
| `D2` | PASS | 6/6 same-origin URLs in `dist/index.html` are prefixed with `/ugo-platform/` |
| `D3` | PASS | each of those URLs resolves to a real file inside `dist/` |
| `D5` | PASS | `manifest.webmanifest` present, icons present |
| `E1` | PASS | no runtime string resolves against the origin root |
| `D0` | **FAIL** | `public/sw.js` is replaced by the Workbox-generated worker (push listeners lost) |
| `E2` | WARN | 10 hardcoded `"/ugo-platform/"` literals: `src/App.tsx:1023,1038,1039` (notification icon/badge), `src/main.tsx:9` (SW registration), `public/sw.js` |
| `F2` | **FAIL** | last Pages workflow run failed at `build: Run actions/setup-node@v4` — no deploy has ever run |

Read the shape of that output: **every path check is green** — base, source entry, artifact URLs,
manifest scope — so the deployment *path* is correct. `F2` and `D0` are not path bugs: nothing is
being published at all (`F2`), and the hand-written service worker never reaches the artifact (`D0`).
`package-lock.json` on this branch fixes `F2`; `D0` and `E2` are left for a separate change.

---

## 2. The model (why each check exists)

- A **project site** is served at `https://<owner>.github.io/<repo>/`. Everything must therefore be
  addressed under `/​<repo>/`. Only a **user/org site** (`<owner>.github.io`) or a custom-domain apex
  gets `/`.
- `base` is applied by Vite **at build time** to (a) `<script src>` / `<link href>` in `index.html`,
  (b) emitted asset filenames, (c) URLs Vite injects (`manifest.webmanifest`, `registerSW.js`),
  and (d) module imports that resolve to files in `public/`.
- `base` is **not** applied to strings you write inside JS/TS at runtime:
  `'/ugo-platform/icon.svg'` inside `public/sw.js` or inside a notification payload is shipped
  verbatim. That is why `E2` exists: those literals are correct today only because `base` happens to
  equal the repository name.
- `*.github.io` has **no SPA rewrite**: an unknown *path* returns Pages' 404. This app uses hash
  navigation (`#/requests`), which the server never sees, so deep links work — `B3` checks that.
- With `build_type: workflow`, Pages publishes **only** what `actions/upload-pages-artifact` hands to
  `actions/deploy-pages`. A red deploy run = the previous artifact (or nothing), no matter how green
  the config looks.
- PWA: `start_url`, `scope`, `id` and the service worker URL must all be inside `base`. A scope
  outside the served path silently kills install and offline caching — `A4` + `D5` check both sides.

---

## 3. What "index.html correctly points to assets" means concretely

Source (`index.html`) — absolute paths **without** the base are expected here:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<script type="module" src="/src/main.tsx"></script>
```

Built (`dist/index.html`) — every one of those must have the base prefix; this is the exact string
`D2`/`D3` assert:

```html
<link rel="apple-touch-icon" href="/ugo-platform/apple-touch-icon.png"/>
<link rel="icon" type="image/svg+xml" href="/ugo-platform/icon.svg"/>
<script type="module" crossorigin src="/ugo-platform/assets/index-DODVdRAD.js"></script>
<link rel="stylesheet" crossorigin href="/ugo-platform/assets/index-1WY6p1TT.css">
<link rel="manifest" href="/ugo-platform/manifest.webmanifest">
<script id="vite-plugin-pwa:register-sw" src="/ugo-platform/registerSW.js"></script>
```

Failure signature: a build in which `base` was `'/ugo-platform/'` while the site was published at a
different path yields a document that references `/ugo-platform/assets/…` → **200 for the HTML,
404 for the JS** → blank screen with no visible error in the address bar.

---

## 4. Manual verification (no script)

```sh
# 1. expected path, straight from the remote
git remote get-url origin                  # → …/<owner>/<repo>.git ; path must be /<repo>/

# 2. the two values that must agree
grep -n "base:" vite.config.ts
grep -rn "/ugo-platform/" src public | head    # literals that only work while base == repo name

# 3. rebuild and read the artifact (what Pages will actually serve)
npm ci && npm run build
grep -oE '(src|href)="[^"]+"' dist/index.html
ls -l dist/assets                           # every referenced file must exist here

# 4. serve the artifact exactly as Pages does — root-relative, no rewrites
npx vite preview --host 127.0.0.1 --port 4321
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/ugo-platform/
for u in $(grep -oE '(src|href)="/ugo-platform/[^"]+"' dist/index.html | sed 's/.*="//;s/"//'); do
  printf "%s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4321$u"
done

# 5. the deployed reality (run from your machine; the sandbox cannot reach *.github.io)
curl -sI https://sebastianzothoficial-cell.github.io/ugo-platform/          # expect 200
curl -s  https://sebastianzothoficial-cell.github.io/ugo-platform/ | grep -oE 'src="[^"]+"'
curl -s  https://sebastianzothoficial-cell.github.io/ugo-platform/ | grep -oE '(src|href)="/[^/"][^"]*"'   # expect nothing

# 6. GitHub-side truth
gh api repos/OWNER/REPO/pages --jq '{status,build_type,source,cname,https_enforced,html_url}'
gh run list --workflow=pages.yml --limit 5
gh run view <RUN_ID> --log-failed | grep -E "lock file|npm ci|Error:" | head
```

Root-cause order when the deployed page is blank: **4.5 (is HTML even 200?) → 4.3/4.4 (asset 404?)
→ 4.6 (deploy green?) → 2 (base vs repo)**.

---

## 5. Symptom → cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| `/ugo-platform/` 404, nothing deployed | Pages not set to **GitHub Actions**, or no successful deploy run | `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow`; get CI green first |
| HTML 200, `assets/*.js` 404 | `base` ≠ repository name (or repo renamed after the build) | set `base: '/<repo>/'`, rebuild, redeploy |
| 404 for everything, `base: '/'` | project site served from a subpath, built for root | same as above |
| Works at root, breaks in `<iframe>`/preview proxy | relative `base` (`'./'`) + absolute runtime strings | keep an absolute `base`; make runtime strings relative to `import.meta.env.BASE_URL` |
| Blank page, no 404s, console shows `Unexpected token '<'` | every asset request fell back to a 404 HTML page | base/artifact-path mismatch — check `C3` (`path: dist`, not `dist/dist`) |
| Deep link `/#/requests` works, `/requests` 404 | expected for hash routing; you are hand-typing a path route | keep hash navigation, or add `dist/404.html` (a copy of `index.html`) as a client-side fallback |
| PWA install prompt never appears; `sw.js` 404 | `sw.js` not copied to `dist/`, or registered path outside base | keep `public/sw.js` (Vite copies it), register `${import.meta.env.BASE_URL}sw.js` |
| Installed app opens the wrong URL / offline cache empty | `start_url`/`scope` ≠ base | align `manifest.id/start_url/scope` with `base` (`A4`) |
| Notification icon broken on Android | `/ugo-platform/…` literal in `public/sw.js` | use a URL relative to the worker (`./pwa-192x192.png`) — a classic worker has no `import.meta` |
| CI red at `Run actions/setup-node@v4` with `cache: npm` | `package-lock.json` not committed | commit the lockfile (or drop `cache: npm`) |
| CI red at `Run npm ci` | lockfile absent/out of sync | `npm install`, commit `package-lock.json` |
| CI red at `npm run typecheck` | source-level break; Pages serves the last good build | fix types; see §6 for the gate |

---

## 6. Making the check a gate

Add one step to the `build` job so a base/path regression fails before the artifact is uploaded:

```yaml
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
      - name: Verify Pages base and artifact paths
        run: node scripts/check-pages-base.mjs --build --strict
      - uses: actions/upload-pages-artifact@v3
        if: github.event_name != 'pull_request'
        with:
          path: dist
```

`--strict` also fails on `WARN`, which currently means `E2` (hardcoded base literals) must be
resolved first — decide whether you want that bar before wiring it in.

The lightweight equivalent in `tests/contracts.test.mjs` (regex only, no fs walking) is also fine as a
first line of defence; the script adds the built-artifact and network layers the regex cannot see.

---

## 7. Known state of `main`

1. **`F2` (blocking, fixed by this branch):** every recent `Build and deploy UGO` run fails at
   `Run actions/setup-node@v4`. `cache: npm` needs a lockfile to hash and none was versioned
   (`git ls-files package-lock.json` → empty), so the build job dies, `deploy` is skipped, and with
   `build_type=workflow` nothing is ever published. `package-lock.json` in this branch makes
   `C4`/`C5`/`F2` green — `F2` only after the change lands on `main`, because it reads the latest run
   of the *default* branch.
2. **`README.md` is stale in two places:** it documents `cp .env.example .env # optional: checked-in
   defaults contain only the existing public project URL and publishable key`, but `main`'s
   `.env.example` now holds three empty assignments — the values live as fallbacks in `src/lib.ts`
   instead. Worth an explicit doc/code pass; the doctor does not assert on it.
3. **`E2` (latent):** 10 hardcoded `/ugo-platform/` literals. Harmless while `base` == repository
   name; silent 404s after a rename, a move to a custom domain, or a root deploy. Note the auth
   redirect already does it right (`` `${location.origin}${import.meta.env.BASE_URL}#/account` `` in
   `src/App.tsx:552`) — only the notification/SW strings were hand-written.
4. **`D0`:** `VitePWA` runs in `generateSW` mode, so Vite writes its own precaching `dist/sw.js`
   (1877 bytes) over the copy of `public/sw.js` (1497 bytes). Verified: `grep -c push dist/sw.js`
   → `0`, so provider push/notification handling is dead in every build. Either wire the file in with
   `injectManifest: { swSrc: 'public/sw.js', swDest: 'sw.js' }` (then add your own precache calls) or
   rename it (`public/push-sw.js`) and register both workers. Note that `dist/registerSW.js` (injected
   by the plugin) already registers `/ugo-platform/sw.js`, and `src/main.tsx` registers the same URL a
   second time — a third symptom of the same collision, not of the base path.
5. The sandbox used to build this guide has egress limited to `github.com`, `api.github.com`,
   `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, so `*.github.io` is unreachable from
   here (`G1` reports `SKIP` with `ECONNRESET`). `--live` must be run from a normal machine;
   `--preview` gives the equivalent check against the artifact locally.
