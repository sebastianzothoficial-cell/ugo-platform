import { uid } from './lib'
import type { SupabaseClient } from '@supabase/supabase-js'

// Front-end contract for the UGO marketplace flow, adapted from the previous project's
// `supabaseDispatch.ts`, `clientActionService.ts` and `providerService.ts`. The rule that matters:
// an RPC can commit and still lose its response, so **no state change is reported as successful until
// the persisted row confirms it**, and a retry must never create a second order.
export type ServiceRow = { id: string; numero?: number; estado: string; proveedor_id: string | null; metadata?: Record<string, unknown> | null }
export type Owner = { column: 'cliente_id' | 'proveedor_id'; value: string }
// Notices are localised by the caller; `message` carries the database reason verbatim, because that text
// is the authoritative explanation of a rejected transition (proximity, evidence, offer already answered).
export type FlowNotice = 'flowUnverified' | 'flowRetryLater' | 'flowLocationMissing' | 'flowEvidenceBefore' | 'flowEvidenceAfter' | 'flowNotCancellable' | 'flowNotAdvanceable' | 'flowOfferStale' | 'flowUploadFailed'
export type FlowResult = { ok: true; recovered: boolean; row: ServiceRow | null } | { ok: false; message: string; unverified: boolean; notice: FlowNotice }

// The action timeout is what makes a lost response recoverable instead of fatal. It is exported as a
// mutable config so the regression tests can exercise the recovery path without waiting 12 seconds.
export const flowConfig = { actionTimeoutMs: 12000, verifyTimeoutMs: 6000 }
// Canonical `public.servicio_estado` transitions, exactly as `private.avanzar_servicio_impl` allows them.
export const PROVIDER_NEXT: Record<string, string> = { asignado: 'en_camino', en_camino: 'llegado', llegado: 'en_progreso', en_progreso: 'esperando_aprobacion' }
export const MATCHING_STATES = ['buscando', 'ofrecido']
export const CANCELLABLE_STATES = ['buscando', 'ofrecido', 'asignado', 'en_camino', 'llegado']
// The database refuses these transitions without the matching evidence photo.
export const EVIDENCE_FOR_STATE: Record<string, 'antes' | 'despues'> = { en_progreso: 'antes', esperando_aprobacion: 'despues' }
export const SERVICE_EVIDENCE_BUCKET = 'service-evidence'

function fail(notice: FlowNotice, { message = '', unverified = false }: { message?: string; unverified?: boolean } = {}): FlowResult {
  return { ok: false, message, unverified, notice }
}
// PostgREST hands back `{ code, message, details }`, the SDK sometimes an Error: read the message, never "[object Object]".
function dbMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message
  return ''
}

// A hung PostgREST call must not leave the user waiting without feedback.
async function withTimeout<T>(work: () => PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([Promise.resolve(work()), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms) })]) }
  finally { if (timer) clearTimeout(timer) }
}

async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  try { return await withTimeout(() => db.rpc(name, args), flowConfig.actionTimeoutMs, 'timeout') }
  catch { return { data: null, error: { message: 'timeout', code: 'TIMEOUT' } as never } }
}

// `null` means "the row could not be read": never treated as success, never treated as a confirmed failure.
async function readPersisted(db: SupabaseClient, serviceId: string, owner: Owner): Promise<ServiceRow | null> {
  try {
    const { data, error } = await withTimeout(() => db.from('servicios').select('id,numero,estado,proveedor_id,metadata').eq('id', serviceId).eq(owner.column, owner.value).maybeSingle(), flowConfig.verifyTimeoutMs, 'verify-timeout')
    if (error || !data) return null
    return data as unknown as ServiceRow
  } catch { return null }
}

const dispatched = (row: ServiceRow) => !!row.proveedor_id || (row.estado !== 'buscando' && row.estado !== 'borrador')

export type NewOrder = { clientId: string; category: string; description: string; address: string; scheduledAt: string | null; payment: 'efectivo' | 'pix'; point: { lat: number; lng: number }; draftId: string }

export async function publishOrder(db: SupabaseClient, input: NewOrder): Promise<FlowResult> {
  const owner: Owner = { column: 'cliente_id', value: input.clientId }
  const byDraft = async () => {
    const { data, error } = await db.from('servicios').select('id,numero,estado,proveedor_id,metadata').eq('cliente_id', input.clientId).eq('metadata->>request_draft_id', input.draftId).maybeSingle()
    if (error) throw error
    return (data ?? null) as unknown as ServiceRow | null
  }
  let row: ServiceRow | null = null
  let recovered = false
  try { row = await byDraft() }
  catch (error) { return fail('flowRetryLater', { message: dbMessage(error), unverified: true }) }
  if (row) recovered = true
  if (!row) {
    try {
      row = await withTimeout(async () => {
        const { data, error } = await db.from('servicios').insert({
          cliente_id: input.clientId, categoria_id: input.category, estado: 'buscando',
          descripcion: input.description, direccion_cliente: input.address, programado_para: input.scheduledAt,
          // The draft id is the idempotency key: a retry after a lost response reuses this row.
          metadata: { source: 'ugo-platform', request_draft_id: input.draftId, payment_method: input.payment, requested_payment_method: input.payment }
        }).select('id,numero,estado,proveedor_id,metadata').single()
        if (error) throw error
        return data as unknown as ServiceRow
      }, flowConfig.actionTimeoutMs, 'timeout')
    } catch (error) {
      // The insert may have committed even though the response was lost: look the draft up again before failing.
      try { row = await byDraft() } catch { /* still recoverable later, from the history */ }
      if (!row) return fail('flowRetryLater', { message: dbMessage(error) === 'timeout' ? '' : dbMessage(error), unverified: dbMessage(error) === 'timeout' })
      recovered = true
    }
  }
  if (!row?.id) return fail('flowRetryLater')
  const serviceId = row.id

  if (!dispatched(row)) {
    const location = await rpc(db, 'guardar_ubicacion_servicio_cliente', { p_servicio_id: serviceId, p_lat: input.point.lat, p_lng: input.point.lng })
    // Matching is gated on a saved service location, so a location failure is not a fatal order failure.
    if (location.error) return fail('flowLocationMissing', { message: dbMessage(location.error), unverified: !(await readPersisted(db, serviceId, owner)) })
    const match = await rpc(db, 'iniciar_matching', { p_servicio_id: serviceId })
    if (match.error) {
      const persisted = await readPersisted(db, serviceId, owner)
      if (persisted && dispatched(persisted)) return { ok: true, recovered: true, row: persisted }
      return fail(persisted ? 'flowRetryLater' : 'flowUnverified', { message: dbMessage(match.error), unverified: !persisted })
    }
  }
  const persisted = await readPersisted(db, serviceId, owner)
  // Success is only reported when the persisted row is readable and actually advanced.
  if (!persisted) return fail('flowUnverified')
  if (!dispatched(persisted)) return fail('flowRetryLater')
  return { ok: true, recovered, row: persisted }
}

export async function resumeMatching(db: SupabaseClient, serviceId: string, owner: Owner): Promise<FlowResult> {
  const before = await readPersisted(db, serviceId, owner)
  if (!before) return fail('flowUnverified')
  if (!MATCHING_STATES.includes(before.estado)) return { ok: true, recovered: true, row: before }
  const match = await rpc(db, 'iniciar_matching', { p_servicio_id: serviceId })
  const after = await readPersisted(db, serviceId, owner)
  if (match.error) {
    if (after && dispatched(after)) return { ok: true, recovered: true, row: after }
    return fail(after ? 'flowRetryLater' : 'flowUnverified', { message: dbMessage(match.error), unverified: !after })
  }
  if (!after) return fail('flowUnverified')
  return { ok: true, recovered: true, row: after }
}

export async function cancelOrder(db: SupabaseClient, serviceId: string, owner: Owner): Promise<FlowResult> {
  const before = await readPersisted(db, serviceId, owner)
  if (!before) return fail('flowUnverified')
  if (before.estado === 'cancelado') return { ok: true, recovered: true, row: before }
  if (!CANCELLABLE_STATES.includes(before.estado)) return fail('flowNotCancellable')
  const cancelled = await rpc(db, 'cancelar_servicio', { p_servicio_id: serviceId })
  const after = await readPersisted(db, serviceId, owner)
  if (after?.estado === 'cancelado') return { ok: true, recovered: !!cancelled.error, row: after }
  // A readable but unchanged row means "not confirmed yet", which is different from "not cancellable".
  if (cancelled.error) return fail('flowUnverified', { message: dbMessage(cancelled.error), unverified: !after })
  return fail('flowUnverified', { unverified: !after })
}

type OfferRow = { id: string; estado: string; servicio_id: string }
async function readOffer(db: SupabaseClient, offerId: string, providerId: string): Promise<OfferRow | null> {
  try {
    const { data, error } = await withTimeout(() => db.from('ofertas_servicio').select('id,estado,servicio_id').eq('id', offerId).eq('proveedor_id', providerId).maybeSingle(), flowConfig.verifyTimeoutMs, 'verify-timeout')
    if (error || !data) return null
    return data as OfferRow
  } catch { return null }
}

export async function respondOffer(db: SupabaseClient, offerId: string, providerId: string, accept: boolean): Promise<FlowResult> {
  const result = await rpc(db, accept ? 'aceptar_oferta' : 'rechazar_oferta', { p_oferta_id: offerId })
  const offer = await readOffer(db, offerId, providerId)
  const wanted = accept ? 'aceptada' : 'rechazada'
  if (offer?.estado !== wanted) return fail(offer ? 'flowOfferStale' : 'flowUnverified', { message: dbMessage(result.error), unverified: !offer })
  // An accepted offer only counts once the service is really assigned to this provider.
  if (accept) {
    const service = await readPersisted(db, offer.servicio_id, { column: 'proveedor_id', value: providerId })
    if (!service?.proveedor_id) return fail('flowUnverified')
  }
  return { ok: true, recovered: !!result.error, row: null }
}

export async function advanceService(db: SupabaseClient, serviceId: string, from: string, providerId: string): Promise<FlowResult> {
  const target = PROVIDER_NEXT[from]
  if (!target) return fail('flowNotAdvanceable')
  const need = EVIDENCE_FOR_STATE[target]
  if (need) {
    const { count } = await db.from('evidencias_servicio').select('id', { count: 'exact', head: true }).eq('servicio_id', serviceId).eq('usuario_id', providerId).eq('tipo', need)
    if (!count) return fail(need === 'antes' ? 'flowEvidenceBefore' : 'flowEvidenceAfter')
  }
  const result = target === 'llegado'
    ? await rpc(db, 'marcar_llegada_proveedor', { p_servicio_id: serviceId })
    : await rpc(db, 'avanzar_servicio', { p_servicio_id: serviceId, p_estado: target })
  const persisted = await readPersisted(db, serviceId, { column: 'proveedor_id', value: providerId })
  if (persisted?.estado === target) return { ok: true, recovered: !!result.error, row: persisted }
  if (result.error) return fail(persisted ? 'flowNotAdvanceable' : 'flowUnverified', { message: dbMessage(result.error), unverified: !persisted })
  return fail('flowUnverified')
}

export async function registerEvidence(db: SupabaseClient, serviceId: string, providerId: string, kind: 'antes' | 'despues', file: File): Promise<FlowResult> {
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${serviceId}/${providerId}/${uid()}.${extension}`
  const uploaded = await db.storage.from(SERVICE_EVIDENCE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (uploaded.error) return fail('flowUploadFailed', { message: dbMessage(uploaded.error) })
  const inserted = await db.from('evidencias_servicio').insert({ servicio_id: serviceId, usuario_id: providerId, tipo: kind, storage_path: path, metadata: { mime: file.type || null, size: file.size } })
  if (inserted.error) {
    // The row may exist even if the response was lost: only delete the object when it is really absent.
    const { data: persisted } = await db.from('evidencias_servicio').select('id').eq('servicio_id', serviceId).eq('storage_path', path).maybeSingle()
    if (persisted) return { ok: true, recovered: true, row: null }
    await db.storage.from(SERVICE_EVIDENCE_BUCKET).remove([path])
    return fail('flowUploadFailed', { message: dbMessage(inserted.error) })
  }
  return { ok: true, recovered: false, row: null }
}
