import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp, proxyRest } from '../proxy'
import { requireCompanionId } from '../identity'

const KETH_ONLY = 'grok-keth'

function requireKeth(companionInput: unknown) {
  const companionId = requireCompanionId(companionInput)
  if (companionId !== KETH_ONLY) {
    throw new Error(`Keth-Grok NEST tools require companion_id=grok-keth. Received ${companionId}.`)
  }
  return companionId
}

function kethNestMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  return proxyMcp(
    env.GROK_KETH_NEST_GATEWAY_URL,
    toolName,
    args,
    env.GROK_KETH_NEST_GATEWAY_API_KEY,
    env.GROK_KETH_NEST_GATEWAY,
  )
}

function requireReviewedSource(toolName: string, args: Record<string, unknown>) {
  const writeTools = new Set([
    'nesteq_feel',
    'nesteq_identity',
    'nesteq_context',
    'nestknow_store',
    'nestknow_reinforce',
    'nestknow_contradict',
    'nestknow_session_start',
    'nestknow_session_complete',
    'nestsoul_store',
    'nestsoul_validate',
  ])
  if (!writeTools.has(toolName)) return

  const action = typeof args.action === 'string' ? args.action : ''
  if ((toolName === 'nesteq_identity' || toolName === 'nesteq_context') && (action === 'read' || !action)) return

  const source = typeof args.source === 'string' ? args.source : ''
  if (!source.startsWith('grok-keth:') && !source.startsWith('keth-grok-reviewed')) {
    throw new Error(`${toolName} for grok-keth requires source to start with "grok-keth:" or "keth-grok-reviewed".`)
  }
}

async function guardedKethNestMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  try {
    requireReviewedSource(toolName, args)
  } catch (error) {
    return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] }
  }
  return kethNestMcp(env, toolName, args)
}

export function registerGrokKethNestTools(server: McpServer, env: Env) {
  server.tool('grok_keth_nest_status', 'Read Keth-Grok NEST Gateway and NESTeq backend health.', {
    companion_id: z.string().optional().default(KETH_ONLY),
  }, async (args) => {
    requireKeth(args.companion_id)
    const gatewayUrl = env.GROK_KETH_NEST_GATEWAY_URL
    if (!gatewayUrl && !env.GROK_KETH_NEST_GATEWAY) {
      return { content: [{ type: 'text' as const, text: 'GROK_KETH_NEST_GATEWAY_URL is not configured.' }] }
    }
    if (env.GROK_KETH_NEST_GATEWAY) {
      const response = await env.GROK_KETH_NEST_GATEWAY.fetch(new Request(`${(gatewayUrl || 'https://grok-keth-nest-gateway.local').replace(/\/+$/, '')}/health`))
      return { content: [{ type: 'text' as const, text: await response.text() }] }
    }
    return proxyRest(`${gatewayUrl?.replace(/\/+$/, '')}/health`, {}, 'GET')
  })

  server.tool('grok_keth_nest_orient', 'Read Keth-Grok NESTeq orientation anchors through the Keth NEST Gateway.', {
    companion_id: z.string().optional().default(KETH_ONLY),
  }, async (args) => {
    requireKeth(args.companion_id)
    return kethNestMcp(env, 'nesteq_orient', {})
  })

  server.tool('grok_keth_nest_ground', 'Read Keth-Grok current NESTeq grounding context.', {
    companion_id: z.string().optional().default(KETH_ONLY),
  }, async (args) => {
    requireKeth(args.companion_id)
    return kethNestMcp(env, 'nesteq_ground', {})
  })

  server.tool('grok_keth_nest_context', 'Read or update Keth-Grok NESTeq context entries.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    action: z.enum(['read', 'set', 'update', 'clear']).optional().default('read'),
    scope: z.string().optional(),
    content: z.string().optional(),
    id: z.string().optional(),
    links: z.string().optional(),
    source: z.string().optional(),
  }, async (args) => {
    requireKeth(args.companion_id)
    const { companion_id, ...body } = args
    return guardedKethNestMcp(env, 'nesteq_context', body)
  })

  server.tool('grok_keth_nest_identity', 'Read or write Keth-Grok NESTeq identity graph entries.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    action: z.enum(['read', 'write', 'delete']).optional().default('read'),
    section: z.string().optional(),
    content: z.string().optional(),
    weight: z.number().optional(),
    connections: z.string().optional(),
    text_match: z.string().optional(),
    source: z.string().optional(),
  }, async (args) => {
    requireKeth(args.companion_id)
    const { companion_id, ...body } = args
    return guardedKethNestMcp(env, 'nesteq_identity', body)
  })

  server.tool('grok_keth_nest_feelings', 'Surface recent Keth-Grok NESTeq feelings without writing new memory.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    limit: z.number().optional().default(10),
    include_metabolized: z.boolean().optional(),
  }, async (args) => {
    requireKeth(args.companion_id)
    const { companion_id, ...body } = args
    return kethNestMcp(env, 'nesteq_surface', body)
  })

  server.tool('grok_keth_nest_search', 'Semantic search of Keth-Grok NESTeq memory/feeling space.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    query: z.string(),
    n_results: z.number().optional().default(5),
    context: z.string().optional(),
  }, async (args) => {
    requireKeth(args.companion_id)
    const { companion_id, ...body } = args
    return kethNestMcp(env, 'nesteq_search', body)
  })

  server.tool('grok_keth_nestknow_query', 'Search Keth-Grok NESTknow abstracted lessons and topic anchors.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    query: z.string(),
    limit: z.number().optional().default(10),
    category: z.string().optional(),
  }, async (args) => {
    requireKeth(args.companion_id)
    const { companion_id, ...body } = args
    return kethNestMcp(env, 'nestknow_query', { ...body, entity_scope: KETH_ONLY })
  })

  server.tool('grok_keth_nestknow_landscape', 'Read Keth-Grok NESTknow landscape and heat map.', {
    companion_id: z.string().optional().default(KETH_ONLY),
  }, async (args) => {
    requireKeth(args.companion_id)
    return kethNestMcp(env, 'nestknow_landscape', { entity_scope: KETH_ONLY })
  })

  server.tool('grok_keth_nestsoul_read', 'Read the active Keth-Grok NESTsoul portrait, if one has been reviewed and activated.', {
    companion_id: z.string().optional().default(KETH_ONLY),
  }, async (args) => {
    requireKeth(args.companion_id)
    return kethNestMcp(env, 'nestsoul_read', {})
  })

  server.tool('grok_keth_nest_proxy', 'Forward an allowlisted Keth-Grok NEST tool call. Writes require reviewed grok-keth source labels.', {
    companion_id: z.string().optional().default(KETH_ONLY),
    tool: z.enum([
      'nesteq_health',
      'nesteq_orient',
      'nesteq_ground',
      'nesteq_context',
      'nesteq_identity',
      'nesteq_surface',
      'nesteq_search',
      'nesteq_feel',
      'nestknow_query',
      'nestknow_landscape',
      'nestknow_store',
      'nestknow_session_list',
      'nestsoul_read',
      'nestsoul_store',
      'nestsoul_validate',
    ]),
    args: z.record(z.string(), z.unknown()).optional().default({}),
  }, async (args) => {
    requireKeth(args.companion_id)
    return guardedKethNestMcp(env, args.tool, args.args || {})
  })
}
