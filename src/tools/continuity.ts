import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { normalizeCompanionId } from '../identity'

type ToolResult = { content: Array<{ type: 'text'; text: string }> }

const role = z.enum(['human', 'companion', 'system', 'tool'])

async function continuityFetch(env: Env, path: string, init: RequestInit = {}): Promise<ToolResult> {
  if (!env.CONTINUITY_URL) {
    return { content: [{ type: 'text', text: 'CONTINUITY_URL is not configured.' }] }
  }
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (env.CONTINUITY_API_KEY) headers.set('Authorization', `Bearer ${env.CONTINUITY_API_KEY}`)

  const response = await fetch(`${env.CONTINUITY_URL}${path}`, { ...init, headers })
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
    limit: z.number().optional(),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.mirror) params.set('mirror', args.mirror)
    if (args.limit) params.set('limit', String(args.limit))
    return continuityFetch(env, `/mirror/export${params.toString() ? `?${params}` : ''}`, { method: 'GET' })
  })

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
