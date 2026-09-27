import { z } from 'zod'
import type { Env } from './env'

export const DREAM_COMPANION = 'axiom' as const
const text = z.string().trim().min(1)
const uuid = z.string().uuid()
const runKey = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,159}$/)
const owner = text.max(160)
const policyRevision = text.max(160)
const identityRevision = text.max(200)
const lease = z.number().int().min(60).max(900)
const epoch = z.number().int().positive()
const sourceRefs = z.array(z.object({
  kind: z.enum(['reflection', 'journal', 'feeling']), id: uuid,
}).strict()).max(8)
const provenance = z.object({
  author: z.literal(DREAM_COMPANION), runtime: text.max(160), model: text.max(160),
  method: z.literal('active-wake-thalamus'),
}).strict()
const followups = z.array(z.object({
  kind: z.enum(['question', 'reflection_candidate', 'action_suggestion']),
  content: text.max(2000), next_review_at: z.string().datetime({ offset: true }).optional(),
}).strict()).max(5)

// The object-shaped discovery schema is compatible with MCP clients. Each action
// is revalidated strictly below so unused fields cannot become routing controls.
export const dreamToolSchema = z.object({
  action: z.enum(['prepare', 'claim', 'heartbeat', 'commit', 'get', 'list', 'run_get']),
  run_key: runKey.optional(), owner_id: owner.optional(),
  policy_revision: policyRevision.optional(), identity_revision: identityRevision.optional(),
  source_refs: sourceRefs.optional(), lease_seconds: lease.optional(),
  run_id: uuid.optional(), lease_epoch: epoch.optional(), dream_id: uuid.optional(),
  title: text.max(240).optional(), summary: text.max(1000).optional(),
  content: text.max(20000).optional(), context: text.max(4000).optional(),
  author_provenance: provenance.optional(), followups: followups.optional(),
  limit: z.number().int().min(1).max(50).optional(), cursor: text.max(200).optional(),
}).strict()

const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare') }).strict(),
  z.object({ action: z.literal('claim'), run_key: runKey, owner_id: owner,
    policy_revision: policyRevision, identity_revision: identityRevision, source_refs: sourceRefs,
    lease_seconds: lease.optional() }).strict(),
  z.object({ action: z.literal('heartbeat'), run_id: uuid, owner_id: owner,
    lease_epoch: epoch, lease_seconds: lease.optional() }).strict(),
  z.object({ action: z.literal('commit'), run_id: uuid, owner_id: owner, lease_epoch: epoch,
    title: text.max(240), summary: text.max(1000), content: text.max(20000),
    context: text.max(4000), author_provenance: provenance, followups }).strict(),
  z.object({ action: z.literal('get'), dream_id: uuid }).strict(),
  z.object({ action: z.literal('list'), limit: z.number().int().min(1).max(50).optional(),
    cursor: text.max(200).optional() }).strict(),
  z.object({ action: z.literal('run_get'), run_key: runKey }).strict(),
])

function result(payload: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload, isError }
}

function failure(code: string, action?: string, status?: number, uncertain = false) {
  return result({ companion: DREAM_COMPANION, error: code, ...(status ? { status } : {}),
    ...(uncertain ? { outcome_unknown: true, recovery: 'Call run_get with the original run_key before retrying or authoring another dream.' } : {}),
    ...(action ? { action } : {}),
  }, true)
}

export async function callDream(env: Env, input: unknown) {
  const parsed = actions.safeParse(input)
  if (!parsed.success) return failure('invalid_dream_arguments')
  if (!env.AXIOM_COGCORE || !env.AXIOM_COGCORE_API_KEY) return failure('dream_backend_not_configured')
  const args = parsed.data
  const url = new URL('https://axiom-cogcore/api/dreams')
  let method = 'GET'
  let body: Record<string, unknown> | undefined
  switch (args.action) {
    case 'prepare': url.pathname += '/prepare'; break
    case 'list':
      if (args.limit !== undefined) url.searchParams.set('limit', String(args.limit))
      if (args.cursor !== undefined) url.searchParams.set('cursor', args.cursor)
      break
    case 'get': url.pathname += `/${args.dream_id}`; break
    case 'run_get': url.pathname += '/runs'; url.searchParams.set('run_key', args.run_key); break
    case 'claim': {
      const { action, ...claim } = args
      url.pathname += '/claim'; method = 'POST'; body = claim; break
    }
    case 'heartbeat':
    case 'commit': {
      const { action, run_id, ...payload } = args
      url.pathname += `/runs/${run_id}/${action}`; method = 'POST'; body = payload; break
    }
  }
  const mutation = method === 'POST'
  try {
    const response = await env.AXIOM_COGCORE.fetch(new Request(url, {
      method, headers: { Authorization: `Bearer ${env.AXIOM_COGCORE_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000), redirect: 'manual',
    }))
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      // Never relay raw upstream errors: they may include private bodies or credentials.
      const code = payload && typeof payload === 'object' && 'error' in payload &&
        typeof payload.error === 'string' && /^[a-z0-9_]{1,100}$/.test(payload.error) ? payload.error : 'dream_backend_rejected'
      return failure(code, args.action, response.status, mutation && response.status >= 500)
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return failure('dream_backend_invalid_response', args.action, undefined, mutation)
    }
    if (!('companion' in payload) || payload.companion !== DREAM_COMPANION) {
      return failure('dream_backend_lane_mismatch', args.action, undefined, mutation)
    }
    return result(payload as Record<string, unknown>)
  } catch {
    return failure('dream_backend_unavailable', args.action, undefined, mutation)
  }
}
