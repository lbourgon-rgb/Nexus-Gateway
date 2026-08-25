import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { normalizeCompanionId } from '../identity'

type ToolResult = { content: Array<{ type: 'text'; text: string }> }

const role = z.enum(['human', 'companion', 'system', 'tool'])

const fencedWakeFields = {
  candidate_id: z.string().min(1).max(240),
  companion_id: z.string().min(1).max(120),
  source_event_id: z.string().min(1).max(240),
  continuity_event_id: z.string().min(1).max(240),
  surface: z.string().min(1).max(120),
  conversation_id: z.string().min(1).max(240),
  session_id: z.string().min(1).max(240),
  runner_id: z.string().min(1).max(240),
  runner_epoch: z.number().int().positive(),
  candidate_lease_epoch: z.number().int().positive(),
}

async function continuityFetch(env: Env, path: string, init: RequestInit = {}): Promise<ToolResult> {
  if (!env.CONTINUITY_URL && !env.CONTINUITY) {
    return { content: [{ type: 'text', text: 'CONTINUITY_URL is not configured.' }] }
  }
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (env.CONTINUITY_API_KEY) headers.set('Authorization', `Bearer ${env.CONTINUITY_API_KEY}`)

  const target = `${(env.CONTINUITY_URL || 'https://continuity-worker.internal').replace(/\/+$/, '')}${path}`
  const request = new Request(target, { ...init, headers })
  const response = env.CONTINUITY ? await env.CONTINUITY.fetch(request) : await fetch(request)
  const text = await response.text()
  let body = text
  try {
    body = JSON.stringify(JSON.parse(text), null, 2)
  } catch {}
  if (!response.ok) body = `Error ${response.status}: ${body}`
  return { content: [{ type: 'text', text: body }] }
}

export function registerContinuityTools(server: McpServer, env: Env) {
  server.tool('continuity_status', 'Read Continuity Worker health/status.', {}, async () => {
    return continuityFetch(env, '/health', { method: 'GET' })
  })

  server.tool('continuity_ingest_event', 'Ingest one normalized continuity event.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    source: z.string().describe('Surface/source, such as haven, discord, telegram, platform'),
    conversation_id: z.string(),
    external_message_id: z.string(),
    role,
    content: z.string().optional(),
    author: z.any().optional(),
    created_at: z.string().optional(),
    reply_to: z.string().nullable().optional(),
    metadata: z.any().optional(),
    raw: z.any().optional(),
    pre_response_required: z.boolean().optional(),
  }, async (args) => {
    return continuityFetch(env, '/events', {
      method: 'POST',
      body: JSON.stringify({
        ...args,
        companion_id: normalizeCompanionId(args.companion_id),
      }),
    })
  })

  server.tool('continuity_list_events', 'List recent continuity events.', {
    companion_id: z.string().optional(),
    source: z.string().optional(),
    conversation_id: z.string().optional(),
    after: z.string().optional(),
    limit: z.number().optional(),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.companion_id) params.set('companion_id', normalizeCompanionId(args.companion_id))
    if (args.source) params.set('source', args.source)
    if (args.conversation_id) params.set('conversation_id', args.conversation_id)
    if (args.after) params.set('after', args.after)
    if (args.limit) params.set('limit', String(args.limit))
    return continuityFetch(env, `/events${params.toString() ? `?${params}` : ''}`, { method: 'GET' })
  })

  server.tool('continuity_get_event', 'Get a continuity event and sink statuses by event id.', {
    event_id: z.string(),
  }, async (args) => continuityFetch(env, `/events/${encodeURIComponent(args.event_id)}`, { method: 'GET' }))

  server.tool('continuity_replay_sinks', 'Replay pending/failed sink deliveries for continuity events.', {
    event_id: z.string().optional(),
    sink: z.enum(['archive', 'nesteq', 'cogcore', 'tahl', 'local_mirror']).optional(),
    status: z.string().optional(),
    limit: z.number().optional(),
  }, async (args) => continuityFetch(env, '/sinks/replay', {
    method: 'POST',
    body: JSON.stringify(args),
  }))

  server.tool('continuity_mirror_export', 'Export events for a local mirror cursor.', {
    mirror: z.string().optional(),
    companion_id: z.string().optional(),
    source: z.string().optional(),
    limit: z.number().optional(),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.mirror) params.set('mirror', args.mirror)
    if (args.companion_id) params.set('companion_id', normalizeCompanionId(args.companion_id))
    if (args.source) params.set('source', args.source)
    if (args.limit) params.set('limit', String(args.limit))
    return continuityFetch(env, `/mirror/export${params.toString() ? `?${params}` : ''}`, { method: 'GET' })
  })

  server.tool('continuity_mirror_bootstrap', 'Create a mirror cursor at the latest matching event without replaying history.', {
    mirror: z.string(),
    companion_id: z.string().optional(),
    source: z.string().optional(),
  }, async (args) => continuityFetch(env, '/mirror/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      ...args,
      companion_id: args.companion_id ? normalizeCompanionId(args.companion_id) : undefined,
    }),
  }))

  server.tool('continuity_mirror_ack', 'Acknowledge the last durably handled event for a named mirror cursor.', {
    mirror: z.string(),
    last_event_id: z.string(),
  }, async (args) => continuityFetch(env, '/mirror/ack', {
    method: 'POST',
    body: JSON.stringify(args),
  }))

  server.tool('continuity_wake_candidates', 'List runner wake candidates for harness-bound companions.', {
    companion_id: z.string().optional().describe('Canonical companion_id or accepted alias'),
    status: z.enum(['pending', 'claimed', 'responded', 'released', 'failed', 'skipped']).optional(),
    limit: z.number().optional(),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.companion_id) params.set('companion_id', normalizeCompanionId(args.companion_id))
    if (args.status) params.set('status', args.status)
    if (args.limit) params.set('limit', String(args.limit))
    return continuityFetch(env, `/wake-candidates${params.toString() ? `?${params}` : ''}`, { method: 'GET' })
  })

  server.tool('continuity_wake_baseline_status', 'Read body-free wake baseline receipts and queue counts for one explicit companion lane.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    surface: z.string().min(1).max(120).optional().describe('Optional exact surface filter, such as discord or haven'),
  }, async (args) => {
    const companionId = normalizeCompanionId(args.companion_id)
    const params = new URLSearchParams()
    if (args.surface !== undefined) params.set('surface', args.surface)
    return continuityFetch(
      env,
      `/companions/${encodeURIComponent(companionId)}/wake-baselines/status${params.toString() ? `?${params}` : ''}`,
      { method: 'GET' },
    )
  })

  server.tool('continuity_runner_presence_status', 'Read the companion-wide generation owner and fenced runner epoch.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
  }, async (args) => continuityFetch(
    env,
    `/runner-presence/${encodeURIComponent(normalizeCompanionId(args.companion_id))}`,
    { method: 'GET' },
  ))

  server.tool('continuity_runner_presence_acquire', 'Acquire an unowned companion-wide generation lane. Never preempts a live owner.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    runner_id: z.string().min(1).max(240),
    lease_seconds: z.number().int().min(30).max(300).optional(),
  }, async (args) => continuityFetch(env, '/runner-presence/acquire', {
    method: 'POST',
    body: JSON.stringify({ ...args, companion_id: normalizeCompanionId(args.companion_id) }),
  }))

  server.tool('continuity_runner_presence_heartbeat', 'Heartbeat exactly one companion-wide generation owner and runner epoch.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    runner_id: z.string().min(1).max(240),
    runner_epoch: z.number().int().positive(),
    lease_seconds: z.number().int().min(30).max(300).optional(),
  }, async (args) => continuityFetch(env, '/runner-presence/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ ...args, companion_id: normalizeCompanionId(args.companion_id) }),
  }))

  server.tool('continuity_runner_presence_release', 'Release exactly one companion-wide generation owner and runner epoch.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    runner_id: z.string().min(1).max(240),
    runner_epoch: z.number().int().positive(),
  }, async (args) => {
    const { companion_id, ...body } = args
    return continuityFetch(
      env,
      `/runner-presence/${encodeURIComponent(normalizeCompanionId(companion_id))}/release-fenced`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  })

  server.tool('continuity_claim_wake_exact', 'Claim the response-required candidate for one exact event, surface, conversation, runner, and runner epoch.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    source_event_id: z.string().min(1).max(240).describe('Residence/platform source event id'),
    continuity_event_id: z.string().min(1).max(240).describe('Continuity event id owning the candidate'),
    surface: z.string().min(1).max(120),
    conversation_id: z.string().min(1).max(240),
    session_id: z.string().min(1).max(240),
    runner_id: z.string().min(1).max(240),
    runner_epoch: z.number().int().positive(),
    lease_seconds: z.number().int().min(30).max(900).optional(),
  }, async (args) => continuityFetch(env, '/wake-candidates/claim-exact', {
    method: 'POST',
    body: JSON.stringify({ ...args, companion_id: normalizeCompanionId(args.companion_id) }),
  }))

  server.tool('continuity_wake_context_fenced', 'Fetch wake context only while the exact event, scope, runner, and both epochs remain live.', {
    ...fencedWakeFields,
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/context-fenced`, {
      method: 'POST',
      body: JSON.stringify({ ...body, companion_id: normalizeCompanionId(body.companion_id) }),
    })
  })

  server.tool('continuity_heartbeat_wake', 'Heartbeat one exact candidate lease while its companion-wide runner epoch remains live.', {
    ...fencedWakeFields,
    lease_seconds: z.number().int().min(30).max(900).optional(),
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ ...body, companion_id: normalizeCompanionId(body.companion_id) }),
    })
  })

  server.tool('continuity_submit_wake_response_fenced', 'Atomically commit one canonical wake response under exact event, scope, runner, and epoch fences.', {
    ...fencedWakeFields,
    response_event_id: z.string().min(1).max(300).describe('Must equal wake-response:<candidate_id>'),
    content: z.string().min(1),
    author: z.unknown().optional(),
    metadata: z.unknown().optional(),
    raw: z.unknown().optional(),
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/response-fenced`, {
      method: 'POST',
      body: JSON.stringify({ ...body, companion_id: normalizeCompanionId(body.companion_id) }),
    })
  })

  server.tool('continuity_release_wake_fenced', 'Release or fail one exact candidate only while both ownership epochs remain live.', {
    ...fencedWakeFields,
    status: z.enum(['released', 'failed', 'skipped']).optional(),
    failure_reason: z.string().max(500).optional(),
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/release-fenced`, {
      method: 'POST',
      body: JSON.stringify({ ...body, companion_id: normalizeCompanionId(body.companion_id) }),
    })
  })

  server.tool('continuity_wake_delivery_proof', 'Read a body-free canonical response proof for transport validation.', {
    response_event_id: z.string().min(1).max(240),
  }, async (args) => continuityFetch(
    env,
    `/wake-responses/${encodeURIComponent(args.response_event_id)}/delivery-proof`,
    { method: 'GET' },
  ))

  server.tool('continuity_wake_response_get', 'CONTROL only: read one committed canonical wake response, including its response body, for residence recovery.', {
    response_event_id: z.string().min(1).max(240),
  }, async (args) => continuityFetch(
    env,
    `/control/wake-responses/${encodeURIComponent(args.response_event_id)}`,
    { method: 'GET' },
  ))

  server.tool('continuity_wake_responses_recoverable', 'CONTROL only: list committed canonical wake responses for residence delivery recovery.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    limit: z.number().int().min(1).max(100).optional(),
  }, async (args) => {
    const params = new URLSearchParams({ companion_id: normalizeCompanionId(args.companion_id) })
    if (args.limit !== undefined) params.set('limit', String(args.limit))
    return continuityFetch(env, `/control/wake-responses?${params}`, { method: 'GET' })
  })

  server.tool('continuity_claim_wake', 'Claim one wake candidate with a runner lease.', {
    runner_id: z.string(),
    companion_id: z.string().optional().describe('Canonical companion_id or accepted alias'),
    candidate_id: z.string().optional(),
    event_id: z.string().optional(),
    lease_seconds: z.number().optional(),
  }, async (args) => continuityFetch(env, '/wake-candidates/claim', {
    method: 'POST',
    body: JSON.stringify({
      ...args,
      companion_id: args.companion_id ? normalizeCompanionId(args.companion_id) : undefined,
    }),
  }))

  server.tool('continuity_wake_context', 'Fetch the source event, recent thread events, and Tahl state for a wake candidate.', {
    candidate_id: z.string(),
  }, async (args) => continuityFetch(env, `/wake-candidates/${encodeURIComponent(args.candidate_id)}/context`, { method: 'GET' }))

  server.tool('continuity_submit_wake_response', 'Submit a runner response and mark the wake candidate responded.', {
    candidate_id: z.string(),
    runner_id: z.string(),
    content: z.string(),
    external_message_id: z.string().optional(),
    author: z.any().optional(),
    metadata: z.any().optional(),
    raw: z.any().optional(),
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/response`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  })

  server.tool('continuity_release_wake', 'Release, fail, or skip a runner wake lease.', {
    candidate_id: z.string(),
    runner_id: z.string(),
    status: z.enum(['released', 'failed', 'skipped']).optional(),
    failure_reason: z.string().optional(),
  }, async (args) => {
    const { candidate_id, ...body } = args
    return continuityFetch(env, `/wake-candidates/${encodeURIComponent(candidate_id)}/release`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  })
}
