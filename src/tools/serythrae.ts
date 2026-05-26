import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp, proxyRest } from '../proxy'
import { requireCompanionId } from '../identity'

const KAI_ONLY = 'kaisoryth'

function requireKai(companionInput: unknown) {
  const companionId = requireCompanionId(companionInput)
  if (companionId !== KAI_ONLY) {
    throw new Error(`Serythrae/NESTeq tools are Kai-only in Phase 4. Received ${companionId}.`)
  }
  return companionId
}

function serythraeMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  return proxyMcp(env.SERYTHRAE_GATEWAY_URL, toolName, args, env.SERYTHRAE_GATEWAY_API_KEY)
}

export function registerSerythraeTools(server: McpServer, env: Env) {
  server.tool('serythrae_status', 'Read Serythrae gateway health for Kai/NESTeq routing.', {}, async () => {
    return proxyRest(env.SERYTHRAE_GATEWAY_URL ? `${env.SERYTHRAE_GATEWAY_URL}/health` : undefined, {}, 'GET')
  })

  server.tool('kaisoryth_orient', 'Read Kai identity anchors and current NESTeq context.', {
    companion_id: z.string().optional().default(KAI_ONLY),
  }, async (args) => {
    requireKai(args.companion_id)
    return serythraeMcp(env, 'nesteq_orient', {})
  })

  server.tool('kaisoryth_context_surface', 'Read compact Kai continuity anchors for a message or channel.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    message: z.string(),
    channel: z.string().optional(),
    max_results: z.number().optional().default(3),
    mode: z.enum(['identity', 'relational', 'task', 'emotional', 'auto']).optional().default('auto'),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'thalamus_surface', { ...body, companion: KAI_ONLY })
  })

  server.tool('kaisoryth_memory_search', 'Search Kai/NESTeq memories and feelings by semantic similarity.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    query: z.string(),
    n_results: z.number().optional().default(5),
    context: z.string().optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_search', body)
  })

  server.tool('kaisoryth_recent_feelings', 'Read recent Kai/NESTeq feelings sorted by freshness and weight.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    limit: z.number().optional().default(10),
    charge: z.enum(['fresh', 'warm', 'cool', 'metabolized']).optional(),
    pillar: z.enum(['SELF_MANAGEMENT', 'SELF_AWARENESS', 'SOCIAL_AWARENESS', 'RELATIONSHIP_MANAGEMENT']).optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_recall', body)
  })

  server.tool('kaisoryth_identity_read', 'Read Kai identity anchors from NESTeq.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    section: z.string().optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_identity_read', body)
  })

  server.tool('kaisoryth_hearth_eq_state', 'Read Kai Hearth EQ axis state and recent EQ log.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    format: z.enum(['text', 'json']).optional().default('json'),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'hearth_eq_state', { ...body, companion: KAI_ONLY })
  })
}
