// Behaviour tests for the marketplace flow contract. The real module is bundled with esbuild and driven by an
// in-memory PostgREST-shaped fake, so the assertions are about what the user is told after a lost response —
// not about which strings appear in the source.
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'ugo-flow-'))
// src/flow.ts needs only `uid()` from lib.ts, and lib.ts would build a Supabase client at import time.
writeFileSync(join(dir, 'lib-stub.mjs'), `let seed = 0\nexport const uid = () => 'uid-' + (++seed)\n`)
const bundled = await build({
  stdin: { contents: `export * from './src/flow'`, resolveDir: root, loader: 'ts', sourcefile: 'flow-entry.ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'stub-lib', setup(b) { b.onResolve({ filter: /(^|\/)lib$/ }, () => ({ path: join(dir, 'lib-stub.mjs') })) } }]
})
const flowPath = join(dir, 'flow.mjs')
writeFileSync(flowPath, bundled.outputFiles[0].text)
const flow = await import(pathToFileURL(flowPath).href)
// Shorten the recoverability windows so the lost-response paths are exercised without waiting 12 seconds.
flow.flowConfig.actionTimeoutMs = 40
flow.flowConfig.verifyTimeoutMs = 40

const TABLES = ['servicios', 'ofertas_servicio', 'evidencias_servicio']
const makeStore = (rows = {}) => ({
  tables: Object.fromEntries(TABLES.map(t => [t, [...(rows[t] || [])]])),
  rpcs: {},
  log: { rpcs: [], inserts: [], uploads: [], removed: [] },
  insertError: null, insertHangs: false, uploadError: null
})
const hang = () => new Promise(() => {})

function makeDb(store) {
  const matches = (row, filters) => Object.entries(filters).every(([key, value]) => {
    if (key.startsWith('metadata->>')) return String(row.metadata?.[key.slice('metadata->>'.length)] ?? '') === String(value)
    if (key.startsWith('in:')) return value.includes(row[key.slice(3)])
    return String(row[key] ?? '') === String(value)
  })
  const table = name => {
    const filters = {}
    let insertRow = null, head = false
    const finish = async mode => {
      if (insertRow !== null) {
        store.log.inserts.push({ table: name, row: insertRow })
        // A committed insert whose response is lost: the row exists, the client never hears about it.
        if (store.insertHangs) { store.tables[name].push({ id: 'svc-1', estado: 'buscando', ...insertRow }); store.insertHangs = false; return hang() }
        if (store.insertError) { const error = store.insertError; store.insertError = null; return { data: null, error } }
        const row = { id: 'svc-1', estado: 'buscando', ...insertRow }
        store.tables[name].push(row)
        return mode === 'list' ? { data: null, error: null } : { data: row, error: null }
      }
      const rows = (store.tables[name] || []).filter(r => matches(r, filters))
      if (head) return { count: rows.length, data: null, error: null }
      if (mode === 'maybeSingle') return { data: rows[0] ?? null, error: null }
      if (mode === 'single') return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
      return { data: rows, error: null }
    }
    const api = {
      select: (_cols, opts) => { head = opts?.head === true; return api },
      eq: (key, value) => { filters[key] = value; return api },
      in: (key, value) => { filters['in:' + key] = value; return api },
      order: () => api,
      limit: () => api,
      maybeSingle: () => finish('maybeSingle'),
      single: () => finish('single'),
      insert: row => { insertRow = row; return api },
      then: (onOk, onErr) => finish('list').then(onOk, onErr)
    }
    return api
  }
  return {
    from: table,
    rpc: async (name, args) => {
      store.log.rpcs.push({ name, args })
      const handler = store.rpcs[name]
      return (handler ? await handler(args) : null) ?? { data: null, error: null }
    },
    storage: { from: bucket => ({
      upload: async path => { store.log.uploads.push({ bucket, path }); return store.uploadError ? { data: null, error: store.uploadError } : { data: { path }, error: null } },
      remove: async paths => { store.log.removed.push(...paths); return { data: null, error: null } }
    }) }
  }
}
const order = (over = {}) => ({ clientId: 'c-1', category: 'cat-1', description: 'Montar um móvel', address: 'Rua das Flores 10', scheduledAt: null, payment: 'efectivo', point: { lat: -27.6, lng: -48.55 }, draftId: 'draft-1', ...over })
const serviceRow = (over = {}) => ({ id: 'svc-1', numero: 7, estado: 'buscando', cliente_id: 'c-1', proveedor_id: null, metadata: { request_draft_id: 'draft-1' }, ...over })
const rpcNames = store => store.log.rpcs.map(r => r.name)
const client = store => makeDb(store)

test('publishOrder reuses the draft row instead of publishing a second order', async () => {
  const store = makeStore({ servicios: [serviceRow()] })
  store.rpcs.iniciar_matching = () => { store.tables.servicios[0].estado = 'ofrecido'; return null }
  const result = await flow.publishOrder(client(store), order())
  assert.equal(result.ok, true)
  assert.equal(result.recovered, true, 'a reused draft must be reported as recovered')
  assert.equal(store.log.inserts.length, 0, 'no second insert for the same draft')
  assert.deepEqual(rpcNames(store), ['guardar_ubicacion_servicio_cliente', 'iniciar_matching'])
  assert.equal(result.row.estado, 'ofrecido')
})
test('an insert that commits but loses its response is not published again', async () => {
  const store = makeStore()
  store.insertHangs = true
  store.rpcs.iniciar_matching = () => { store.tables.servicios[0].estado = 'ofrecido'; return null }
  const result = await flow.publishOrder(client(store), order())
  assert.equal(store.log.inserts.length, 1, 'exactly one insert attempt')
  assert.equal(store.tables.servicios.length, 1, 'the retry must not create a second service')
  assert.equal(result.ok, true)
  assert.equal(result.recovered, true)
})
test('a response that did not move the row is not shown as success', async () => {
  const store = makeStore()
  const result = await flow.publishOrder(client(store), order())
  assert.equal(result.ok, false)
  assert.equal(result.notice, 'flowRetryLater')
  assert.equal(result.unverified, false)
  assert.equal(store.tables.servicios.length, 1, 'the saved order stays visible for the retry')
})
test('a lost location write never claims the search started', async () => {
  const store = makeStore({ servicios: [serviceRow()] })
  store.rpcs.guardar_ubicacion_servicio_cliente = () => hang()
  store.rpcs.iniciar_matching = () => hang()
  const result = await flow.publishOrder(client(store), order())
  assert.equal(result.ok, false, 'a location timeout must not be reported as a published search')
  assert.equal(result.notice, 'flowLocationMissing')
  assert.equal(result.unverified, false, 'the order row is still readable, so the retry stays available')
  assert.deepEqual(rpcNames(store), ['guardar_ubicacion_servicio_cliente'], 'matching is not attempted after a failed location write')
})
test('uncertain state after a failed matching is reported as unverified', async () => {
  const store = makeStore({ servicios: [serviceRow()] })
  store.rpcs.iniciar_matching = () => { store.tables.servicios.length = 0; return hang() }
  const result = await flow.publishOrder(client(store), order())
  assert.equal(result.ok, false)
  assert.equal(result.notice, 'flowUnverified')
  assert.equal(result.unverified, true, 'the user must be told the state could not be read, not that it failed')
})
test('cancel is only reported once the row reads cancelado', async () => {
  const committed = makeStore({ servicios: [serviceRow({ estado: 'asignado', proveedor_id: 'p-1' })] })
  committed.rpcs.cancelar_servicio = () => { committed.tables.servicios[0].estado = 'cancelado'; return hang() }
  const first = await flow.cancelOrder(client(committed), 'svc-1', { column: 'cliente_id', value: 'c-1' })
  assert.equal(first.ok, true, 'a lost response after the commit must not look like a failed cancellation')
  assert.equal(first.recovered, true)

  const notAllowed = makeStore({ servicios: [serviceRow({ estado: 'esperando_aprobacion' })] })
  const second = await flow.cancelOrder(client(notAllowed), 'svc-1', { column: 'cliente_id', value: 'c-1' })
  assert.equal(second.ok, false)
  assert.equal(second.notice, 'flowNotCancellable')
  assert.deepEqual(rpcNames(notAllowed), [], 'a state that cannot be cancelled must not call the RPC')

  const unanswered = makeStore({ servicios: [serviceRow()] })
  unanswered.rpcs.cancelar_servicio = () => hang()
  const third = await flow.cancelOrder(client(unanswered), 'svc-1', { column: 'cliente_id', value: 'c-1' })
  assert.equal(third.ok, false)
  assert.equal(third.notice, 'flowUnverified')
})
test('resumeMatching is a no-op once the search already advanced', async () => {
  const store = makeStore({ servicios: [serviceRow({ estado: 'asignado', proveedor_id: 'p-1' })] })
  const result = await flow.resumeMatching(client(store), 'svc-1', { column: 'cliente_id', value: 'c-1' })
  assert.equal(result.ok, true)
  assert.equal(result.recovered, true)
  assert.deepEqual(rpcNames(store), [], 'an already assigned order must not be dispatched again')
})
test('offer answers are confirmed by the persisted offer and the assignment', async () => {
  const acceptedLate = makeStore({ servicios: [serviceRow({ estado: 'asignado', proveedor_id: 'p-1' })], ofertas_servicio: [{ id: 'o-1', estado: 'aceptada', servicio_id: 'svc-1', proveedor_id: 'p-1' }] })
  acceptedLate.rpcs.aceptar_oferta = () => hang()
  const accepted = await flow.respondOffer(client(acceptedLate), 'o-1', 'p-1', true)
  assert.equal(accepted.ok, true, 'the acceptance is real even when the response never arrives')
  assert.equal(accepted.recovered, true)

  const stale = makeStore({ ofertas_servicio: [{ id: 'o-1', estado: 'expirada', servicio_id: 'svc-1', proveedor_id: 'p-1' }] })
  const declined = await flow.respondOffer(client(stale), 'o-1', 'p-1', false)
  assert.equal(declined.ok, false)
  assert.equal(declined.notice, 'flowOfferStale')

  const unassigned = makeStore({ servicios: [serviceRow({ estado: 'ofrecido' })], ofertas_servicio: [{ id: 'o-1', estado: 'aceptada', servicio_id: 'svc-1', proveedor_id: 'p-1' }] })
  const orphan = await flow.respondOffer(client(unassigned), 'o-1', 'p-1', true)
  assert.equal(orphan.ok, false, 'an accepted offer without the assignment is not a success')
  assert.equal(orphan.notice, 'flowUnverified')
})
test('provider transitions follow the database enum and its evidence gates', async () => {
  const missingEvidence = makeStore({ servicios: [serviceRow({ estado: 'llegado', proveedor_id: 'p-1' })] })
  const blocked = await flow.advanceService(client(missingEvidence), 'svc-1', 'llegado', 'p-1')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.notice, 'flowEvidenceBefore')
  assert.deepEqual(rpcNames(missingEvidence), [], 'a transition the database would reject must not be sent')

  const withEvidence = makeStore({ servicios: [serviceRow({ estado: 'llegado', proveedor_id: 'p-1' })], evidencias_servicio: [{ servicio_id: 'svc-1', usuario_id: 'p-1', tipo: 'antes' }] })
  withEvidence.rpcs.avanzar_servicio = () => { withEvidence.tables.servicios[0].estado = 'en_progreso'; return null }
  const advanced = await flow.advanceService(client(withEvidence), 'svc-1', 'llegado', 'p-1')
  assert.equal(advanced.ok, true)
  assert.deepEqual(withEvidence.log.rpcs, [{ name: 'avanzar_servicio', args: { p_servicio_id: 'svc-1', p_estado: 'en_progreso' } }])

  const arrival = makeStore({ servicios: [serviceRow({ estado: 'en_camino', proveedor_id: 'p-1' })] })
  arrival.rpcs.marcar_llegada_proveedor = () => { arrival.tables.servicios[0].estado = 'llegado'; return null }
  assert.equal((await flow.advanceService(client(arrival), 'svc-1', 'en_camino', 'p-1')).ok, true)
  assert.deepEqual(rpcNames(arrival), ['marcar_llegada_proveedor'], 'arrival uses its own RPC')

  const closing = makeStore({ servicios: [serviceRow({ estado: 'esperando_aprobacion', proveedor_id: 'p-1' })] })
  const closed = await flow.advanceService(client(closing), 'svc-1', 'esperando_aprobacion', 'p-1')
  assert.equal(closed.ok, false)
  assert.equal(closed.notice, 'flowNotAdvanceable', 'only the client closes the service')
  assert.deepEqual(Object.entries(flow.PROVIDER_NEXT).filter(([, to]) => to === 'completado' || to === 'ejecutando' || to === 'confirmado'), [], 'the provider must never advance to completado')
})
test('evidence upload never orphans a stored object', async () => {
  const rowMissing = makeStore()
  rowMissing.insertError = { message: 'duplicate key', code: '23505' }
  const failed = await flow.registerEvidence(client(rowMissing), 'svc-1', 'p-1', 'antes', new File(['x'], 'a.BMP', { type: 'image/bmp' }))
  assert.equal(failed.ok, false)
  assert.equal(failed.notice, 'flowUploadFailed')
  assert.match(failed.message, /duplicate key/, 'the database reason is surfaced to the user')
  assert.equal(rowMissing.log.removed.length, 1, 'the object is removed when the row really is absent')
  assert.match(rowMissing.log.uploads[0].path, /^svc-1\/p-1\/uid-\d+\.bmp$/, 'the path is scoped to service and uploader, with a sanitised extension')
  assert.equal(rowMissing.log.uploads[0].bucket, flow.SERVICE_EVIDENCE_BUCKET)

  const committedRow = makeStore()
  committedRow.insertError = { message: 'connection reset', code: '08S01' }
  const db = client(committedRow)
  const original = db.from
  db.from = name => {
    const api = original(name)
    if (name === 'evidencias_servicio') api.maybeSingle = async () => ({ data: { id: 'e-1' }, error: null })
    return api
  }
  const recovered = await flow.registerEvidence(db, 'svc-1', 'p-1', 'antes', new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  assert.equal(recovered.ok, true, 'a committed row with a lost response is success')
  assert.equal(recovered.recovered, true)
  assert.equal(committedRow.log.removed.length, 0, 'the stored object must stay when the row exists')
})
