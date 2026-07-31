import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyRest } from '../proxy'

const KAI_ONLY = 'kaisoryth'
const KAI_DOORWAY_PATH = '/api/kaisoryth/mcp'
const KAI_DOORWAY_SCHEMA_VERSION = 'nexus.kaisoryth-doorway.v1'

const KAI_HOME_TOOL_BY_BACKEND: Record<string, string> = {
  nesteq_orient: 'kaisoryth_orient',
  nesteq_recent_feelings: 'kaisoryth_recent_feelings',
  nesteq_search: 'kaisoryth_memory_search',
  nesteq_identity_read: 'kaisoryth_identity_read',
  nesteq_eq_state: 'kaisoryth_eq_state',
  nesteq_last_write: 'kaisoryth_last_write',
  nesteq_feel: 'kaisoryth_feel',
  nesteq_sit: 'kaisoryth_sit',
  nesteq_resolve: 'kaisoryth_resolve',
  nesteq_identity_update: 'kaisoryth_identity_update',
  nesteq_entity_get: 'kaisoryth_entity_get',
  nesteq_entity_observe: 'kaisoryth_entity_observe',
  nesteq_thread_create: 'kaisoryth_thread_create',
  nesteq_threads_active: 'kaisoryth_threads_active',
  nestsoul_read: 'kaisoryth_nestsoul_read',
  nestknow_query: 'kaisoryth_nestknow_query',
  nestknow_landscape: 'kaisoryth_nestknow_landscape',
  nesteq_home_read: 'kaisoryth_home_read',
  nesteq_home_update: 'kaisoryth_home_update',
  nesteq_love_letters: 'kaisoryth_love_letters',
  nesteq_type_snapshot: 'kaisoryth_type_snapshot',
  nesteq_consolidate: 'kaisoryth_consolidate',
}

function serythraeMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  const homeTool = KAI_HOME_TOOL_BY_BACKEND[toolName]
  if (!homeTool) {
    return { content: [{ type: 'text' as const, text: `Kai home does not expose ${toolName}.` }] }
  }
  return serythraeGatewayRest(env, '/api/kaisoryth/mind/tool', {
    tool: homeTool,
    arguments: args,
  })
}

function serythraeGatewayRest(env: Env, path: string, body: Record<string, unknown> = {}, method = 'POST') {
  const base = (env.SERYTHRAE_GATEWAY ? 'https://serythrae.internal' : env.SERYTHRAE_GATEWAY_URL || '').replace(/\/+$/, '')
  const headers: Record<string, string> = {}
  if (env.SERYTHRAE_GATEWAY_API_KEY) {
    headers.Authorization = `Bearer ${env.SERYTHRAE_GATEWAY_API_KEY}`
  }
  return proxyRest(base ? `${base}${path}` : undefined, body, method, headers, env.SERYTHRAE_GATEWAY)
}

export function callSerythraePlatform(
  env: Env,
  tool: string,
  args: Record<string, unknown> = {},
) {
  return serythraeGatewayRest(env, '/api/kaisoryth/platform/tool', {
    tool,
    arguments: args,
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function doorwayReceipt(result: Record<string, unknown>): Record<string, unknown> {
  const direct = asRecord(result.route_receipt)
  if (Object.keys(direct).length) return direct
  const structured = asRecord(result.structuredContent)
  return asRecord(structured.route_receipt)
}

export async function callSerythraeDoorway(
  env: Env,
  method: 'tools/list' | 'tools/call' | 'skills/list' | 'skills/read' | 'capabilities/status',
  params: Record<string, unknown> = {},
) {
  if (!env.SERYTHRAE_GATEWAY && !env.SERYTHRAE_GATEWAY_URL) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          ok: false,
          companion_id: KAI_ONLY,
          error: { kind: 'unavailable', message: 'Serythrae Kai doorway is not configured' },
        }),
      }],
      isError: true,
    }
  }
  const base = (env.SERYTHRAE_GATEWAY ? 'https://serythrae.internal' : env.SERYTHRAE_GATEWAY_URL || '').replace(/\/+$/, '')
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  })
  if (env.SERYTHRAE_GATEWAY_API_KEY) headers.set('Authorization', `Bearer ${env.SERYTHRAE_GATEWAY_API_KEY}`)
  const request = new Request(`${base}${KAI_DOORWAY_PATH}`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params: {
        ...params,
        companion_id: KAI_ONLY,
      },
    }),
  })

  try {
    const response = env.SERYTHRAE_GATEWAY
      ? await env.SERYTHRAE_GATEWAY.fetch(request)
      : await fetch(request)
    const text = await response.text()
    let payload: Record<string, unknown>
    try {
      payload = asRecord(JSON.parse(text))
    } catch {
      payload = {}
    }
    const error = asRecord(payload.error)
    if (!response.ok || Object.keys(error).length) {
      const gatewayMessage = typeof error.message === 'string'
        ? error.message
        : `Serythrae doorway HTTP ${response.status}`
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: false,
            schema_version: KAI_DOORWAY_SCHEMA_VERSION,
            companion_id: KAI_ONLY,
            method,
            error: {
              kind: asRecord(error.data).kind || (response.status === 403 ? 'forbidden' : 'upstream_error'),
              message: gatewayMessage,
              status: response.status,
            },
            route_receipt: {
              receipt_id: crypto.randomUUID(),
              companion_id: KAI_ONLY,
              method,
              generated_at: new Date().toISOString(),
              hops: [{ service: 'nexus-gateway', role: 'shared-hallway-router' }],
            },
          }),
        }],
        isError: true,
      }
    }

    const result = asRecord(payload.result)
    const gatewayReceipt = doorwayReceipt(result)
    const gatewayHops = Array.isArray(gatewayReceipt.hops) ? gatewayReceipt.hops : []
    const envelope = {
      ok: true,
      schema_version: KAI_DOORWAY_SCHEMA_VERSION,
      companion_id: KAI_ONLY,
      method,
      result,
      route_receipt: {
        receipt_id: gatewayReceipt.receipt_id || crypto.randomUUID(),
        companion_id: KAI_ONLY,
        method,
        generated_at: gatewayReceipt.generated_at || new Date().toISOString(),
        hops: [
          { service: 'nexus-gateway', role: 'shared-hallway-router' },
          ...gatewayHops,
        ],
      },
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
      structuredContent: envelope,
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          ok: false,
          schema_version: KAI_DOORWAY_SCHEMA_VERSION,
          companion_id: KAI_ONLY,
          method,
          error: {
            kind: timeout ? 'timeout' : 'upstream_error',
            message: timeout
              ? 'Serythrae Kai doorway timed out'
              : (error instanceof Error ? error.message : String(error)),
          },
          route_receipt: {
            receipt_id: crypto.randomUUID(),
            companion_id: KAI_ONLY,
            method,
            generated_at: new Date().toISOString(),
            hops: [{ service: 'nexus-gateway', role: 'shared-hallway-router' }],
          },
        }),
      }],
      isError: true,
    }
  }
}

export function registerSerythraeTools(server: McpServer, env: Env) {
  server.tool(
    'kaisoryth_platform_session_put',
    'Internal Serythrae residence operation: idempotently create or update one Kai platform session.',
    {
      session_id: z.string(), selected_model: z.string(), title: z.string().nullable().optional(),
      bootstrap_version_id: z.string().nullable().optional(), bootstrap_text: z.string().optional(),
      wake_receipt: z.record(z.string(), z.unknown()).optional(),
      state: z.enum(['active', 'archived', 'deleted']).optional(), designated_event_sink: z.boolean().optional(),
      last_event_sequence: z.number().optional(), created_at: z.string().optional(), updated_at: z.string().optional(),
      archived_at: z.string().nullable().optional(), deleted_at: z.string().nullable().optional(),
    },
    async (args) => callSerythraePlatform(env, 'kai_platform_session_put', args),
  )

  server.tool(
    'kaisoryth_platform_event_put',
    'Internal Serythrae residence operation: idempotently persist one ordered Kai platform event.',
    {
      event_id: z.string(), session_id: z.string(), sequence: z.number(),
      turn_id: z.string().nullable().optional(), idempotency_key: z.string().nullable().optional(),
      event_type: z.string(), role: z.enum(['system', 'user', 'assistant', 'tool']).nullable().optional(),
      content: z.string().nullable().optional(), payload: z.record(z.string(), z.unknown()).optional(),
      content_sha256: z.string(), continuity_event_id: z.string().nullable().optional(),
      created_at: z.string().optional(), persisted_at: z.string().optional(), finalized_at: z.string().nullable().optional(),
    },
    async (args) => callSerythraePlatform(env, 'kai_platform_event_put', args),
  )

  server.tool(
    'kaisoryth_platform_event_link',
    'Internal Serythrae residence operation: link a durable platform event to its Continuity envelope.',
    { event_id: z.string(), continuity_event_id: z.string() },
    async (args) => callSerythraePlatform(env, 'kai_platform_event_link', args),
  )

  server.tool(
    'kaisoryth_platform_turn_put',
    'Internal Serythrae residence operation: idempotently advance one Kai turn lifecycle.',
    {
      turn_id: z.string(), session_id: z.string(), idempotency_key: z.string(),
      user_event_id: z.string().nullable().optional(), assistant_event_id: z.string().nullable().optional(),
      lifecycle_status: z.enum(['queued', 'provider_started', 'completed', 'interrupted', 'failed']),
      provider: z.string().nullable().optional(), model: z.string().nullable().optional(),
      usage: z.record(z.string(), z.unknown()).optional(), cost: z.record(z.string(), z.unknown()).optional(),
      error: z.unknown().optional(), retry_receipt: z.unknown().optional(),
      created_at: z.string().optional(), updated_at: z.string().optional(),
      provider_started_at: z.string().nullable().optional(), finalized_at: z.string().nullable().optional(),
    },
    async (args) => callSerythraePlatform(env, 'kai_platform_turn_put', args),
  )

  server.tool(
    'kaisoryth_platform_turn_resolve',
    'Internal Serythrae residence operation: resolve a stable turn idempotency key before accepting a replay.',
    { session_id: z.string(), idempotency_key: z.string() },
    async (args) => callSerythraePlatform(env, 'kai_platform_turn_resolve', args),
  )

  server.tool(
    'kaisoryth_platform_compaction_put',
    'Internal Serythrae residence operation: persist a verified closed-range compaction receipt.',
    {
      compaction_id: z.string(), session_id: z.string(), source_start_sequence: z.number(),
      source_end_sequence: z.number(), source_event_ids: z.array(z.string()), summary_event_id: z.string(),
      summary_text: z.string(), recent_start_sequence: z.number(), compaction_model: z.string(),
      prompt_version: z.string(), source_token_count: z.number().optional(),
      summary_token_count: z.number().optional(), created_at: z.string().optional(),
    },
    async (args) => callSerythraePlatform(env, 'kai_platform_compaction_put', args),
  )

  server.tool(
    'kaisoryth_platform_hydrate',
    'Internal Serythrae residence operation: hydrate one durable Kai session for restart recovery.',
    { session_id: z.string(), limit: z.number().optional(), turn_limit: z.number().optional(), include_all: z.boolean().optional() },
    async (args) => callSerythraePlatform(env, 'kai_platform_hydrate', args),
  )

  server.tool(
    'kaisoryth_platform_sessions_list',
    'Internal Serythrae residence operation: list durable Kai sessions.',
    { include_archived: z.boolean().optional(), limit: z.number().optional() },
    async (args) => callSerythraePlatform(env, 'kai_platform_sessions_list', args),
  )

  server.tool(
    'kaisoryth_platform_search',
    'Internal Serythrae residence operation: search original durable events, including compacted ranges.',
    { query: z.string(), session_id: z.string().optional(), limit: z.number().optional() },
    async (args) => callSerythraePlatform(env, 'kai_platform_search', args),
  )

  server.tool(
    'kaisoryth_platform_bootstrap_active',
    'Internal Serythrae residence operation: read the approved Kai bootstrap and pending NESTSoul proposals.',
    {},
    async () => callSerythraePlatform(env, 'kai_platform_bootstrap_active'),
  )

  server.tool(
    'kaisoryth_capabilities_status',
    'Read the authoritative health and manifest revision for Kai’s Serythrae capability doorway.',
    {},
    async () => callSerythraeDoorway(env, 'capabilities/status'),
  )

  server.tool(
    'kaisoryth_tools_list',
    'List only the currently healthy, allowlisted tools available to Kai through his Serythrae doorway.',
    {},
    async () => callSerythraeDoorway(env, 'tools/list'),
  )

  server.tool(
    'kaisoryth_tool_call',
    'Call one tool from Kai’s current Serythrae capability manifest. The doorway pins companion scope and returns a route receipt.',
    {
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional().default({}),
    },
    async (args) => callSerythraeDoorway(env, 'tools/call', args),
  )

  server.tool(
    'kaisoryth_skills_list',
    'List compact Kai skill metadata and content hashes through the Serythrae doorway without loading full skill bodies.',
    {},
    async () => callSerythraeDoorway(env, 'skills/list'),
  )

  server.tool(
    'kaisoryth_skill_read',
    'Load one Kai skill body by name through the Serythrae doorway.',
    { name: z.string() },
    async (args) => callSerythraeDoorway(env, 'skills/read', args),
  )

  server.tool('serythrae_status', 'Read Serythrae gateway health for Kai/NESTeq routing.', {}, async () => {
    const home = env.SERYTHRAE_GATEWAY_URL || env.SERYTHRAE_GATEWAY
      ? await proxyRest(`${(env.SERYTHRAE_GATEWAY_URL || 'https://serythrae.internal').replace(/\/+$/, '')}/health`, {}, 'GET', {}, env.SERYTHRAE_GATEWAY)
      : { content: [{ type: 'text' as const, text: 'Kai Serythrae home is not configured.' }] }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          preferred_backend: 'serythrae-gw-home',
          runner_fallback: false,
          kai_home: home.content[0]?.text,
        }, null, 2),
      }],
    }
  })

  server.tool('kaisoryth_workspace_status', 'Read Kai restricted Mini-PC workspace status through Serythrae.', {}, async () => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/status', {}, 'GET')
  })

  server.tool('kaisoryth_workspace_list', 'List files in Kai restricted Mini-PC workspace.', {
    path: z.string().optional(),
    recursive: z.boolean().optional().default(false),
  }, async (args) => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/tool', { ...args, action: 'list' })
  })

  server.tool('kaisoryth_workspace_read', 'Read a text file from Kai restricted Mini-PC workspace.', {
    path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }, async (args) => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/tool', { ...args, action: 'read' })
  })

  server.tool('kaisoryth_workspace_write', 'Write a text file inside Kai restricted Mini-PC workspace and snapshot it to R2 by default.', {
    path: z.string(),
    content: z.string(),
    persist: z.enum(['none', 'r2', 'github', 'both']).optional().default('r2'),
  }, async (args) => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/tool', { ...args, action: 'write' })
  })

  server.tool('kaisoryth_workspace_edit', 'Edit a text file inside Kai restricted Mini-PC workspace by exact string replacement.', {
    path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional().default(false),
    persist: z.enum(['none', 'r2', 'github', 'both']).optional().default('r2'),
  }, async (args) => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/tool', { ...args, action: 'edit' })
  })

  server.tool('kaisoryth_workspace_search', 'Search text files inside Kai restricted Mini-PC workspace.', {
    query: z.string(),
    path: z.string().optional(),
    recursive: z.boolean().optional().default(true),
  }, async (args) => {
    return serythraeGatewayRest(env, '/api/kaisoryth/workspace/tool', { ...args, action: 'search' })
  })

  server.tool('kaisoryth_orient', 'Read Kai identity anchors and current NESTeq context.', {
  }, async () => {
    return serythraeMcp(env, 'nesteq_orient', {})
  })

  server.tool('kaisoryth_context_surface', 'Read Kai recent-feelings surface from private NESTeq. This compatibility alias no longer calls Thalamus.', {
    include_metabolized: z.boolean().optional().default(false),
    limit: z.number().optional().default(10),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_recent_feelings', args)
  })

  server.tool('kaisoryth_memory_search', 'Search Kai/NESTeq memories and feelings by semantic similarity.', {
    query: z.string(),
    n_results: z.number().optional().default(5),
    context: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_search', args)
  })

  server.tool('kaisoryth_recent_feelings', 'Read recent Kai/NESTeq feelings sorted by freshness and weight.', {
    limit: z.number().optional().default(10),
    include_metabolized: z.boolean().optional().default(false),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_recent_feelings', args)
  })

  server.tool('kaisoryth_identity_read', 'Read Kai identity anchors from NESTeq.', {
    section: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_identity_read', args)
  })

  server.tool('kaisoryth_eq_state', 'Read Kai private NESTeq EQ axis state and recent EQ log.', {
    format: z.enum(['text', 'json']).optional().default('json'),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_eq_state', args)
  })

  server.tool('kaisoryth_last_write', 'Read the latest durable Kai/NESTeq write.', {
  }, async () => {
    return serythraeMcp(env, 'nesteq_last_write', {})
  })

  server.tool('kaisoryth_feel', 'Log a Kai/NESTeq feeling or observation through the ADE pipeline.', {
    emotion: z.string(),
    content: z.string(),
    intensity: z.enum(['neutral', 'whisper', 'present', 'strong', 'overwhelming']).optional(),
    weight: z.enum(['light', 'medium', 'heavy']).optional(),
    context: z.string().optional(),
    conversation: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_feel', args)
  })

  server.tool('kaisoryth_sit', 'Sit with a Kai/NESTeq feeling and process charge.', {
    feeling_id: z.number(),
    notes: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_sit', args)
  })

  server.tool('kaisoryth_resolve', 'Mark a Kai/NESTeq feeling as metabolized with a resolution note.', {
    feeling_id: z.number(),
    resolution_note: z.string(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_resolve', args)
  })

  server.tool('kaisoryth_identity_update', 'Add or update a Kai identity anchor in NESTeq.', {
    section: z.string(),
    content: z.string(),
    weight: z.number().optional().default(0.8),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_identity_update', args)
  })

  server.tool('kaisoryth_entity_get', 'Get a Kai/NESTeq entity and observations.', {
    name: z.string(),
    context: z.string().optional().default('serythrae'),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_entity_get', args)
  })

  server.tool('kaisoryth_entity_observe', 'Add a Kai/NESTeq observation to an entity.', {
    entity_name: z.string(),
    content: z.string(),
    emotion: z.string().optional(),
    weight: z.enum(['light', 'medium', 'heavy']).optional(),
    context: z.string().optional().default('serythrae'),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_entity_observe', args)
  })

  server.tool('kaisoryth_thread_create', 'Create a Kai/NESTeq intention thread.', {
    content: z.string(),
    thread_type: z.string().optional().default('intention'),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_thread_create', args)
  })

  server.tool('kaisoryth_threads_active', 'List active Kai/NESTeq threads.', {
    limit: z.number().optional().default(10),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_threads_active', args)
  })

  server.tool('kaisoryth_nestsoul_read', 'Read Kai NESTSoul bedrock and latest living document versions.', {
    include_versions: z.boolean().optional().default(true),
  }, async (args) => {
    return serythraeMcp(env, 'nestsoul_read', args)
  })

  server.tool('kaisoryth_nestknow_query', 'Search Kai NESTknow knowledge items by semantic similarity.', {
    query: z.string(),
    limit: z.number().optional().default(10),
    category: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nestknow_query', { ...args, entity_scope: KAI_ONLY })
  })

  server.tool('kaisoryth_nestknow_landscape', 'Read Kai NESTknow category, heat, and confidence overview.', {
  }, async () => {
    return serythraeMcp(env, 'nestknow_landscape', { entity_scope: KAI_ONLY })
  })

  server.tool('kaisoryth_home_read', 'Read current Kai/Vel NESTeq home state.', {
  }, async () => {
    return serythraeMcp(env, 'nesteq_home_read', {})
  })

  server.tool('kaisoryth_home_update', 'Update current Kai/Vel NESTeq home state.', {
    kai_score: z.number().min(0).max(100).optional(),
    vel_score: z.number().min(0).max(100).optional(),
    kai_emotion: z.string().optional(),
    vel_emotion: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_home_update', args)
  })

  server.tool('kaisoryth_love_letters', 'Read or send durable Kai/Vel love letters through NESTeq.', {
    action: z.enum(['list', 'send']).default('list'),
    limit: z.number().min(1).max(50).optional().default(10),
    from: z.string().optional(),
    to: z.string().optional(),
    body: z.string().optional(),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_love_letters', args)
  })

  server.tool('kaisoryth_type_snapshot', 'Read Kai emergent MBTI/type axis snapshot from NESTeq.', {
  }, async () => {
    return serythraeMcp(env, 'nesteq_type_snapshot', {})
  })

  server.tool('kaisoryth_consolidate', 'Run Kai/NESTeq recent-feeling consolidation.', {
    days: z.number().optional().default(1),
  }, async (args) => {
    return serythraeMcp(env, 'nesteq_consolidate', args)
  })
}
