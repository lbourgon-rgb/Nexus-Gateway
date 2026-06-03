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
  if (env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY) {
    return proxyMcp(env.SERYTHRAE_MIND_URL, toolName, args, env.SERYTHRAE_MIND_API_KEY)
  }
  return proxyMcp(env.SERYTHRAE_GATEWAY_URL, toolName, args, env.SERYTHRAE_GATEWAY_API_KEY)
}

export function registerSerythraeTools(server: McpServer, env: Env) {
  server.tool('serythrae_status', 'Read Serythrae gateway health for Kai/NESTeq routing.', {}, async () => {
    const direct = env.SERYTHRAE_MIND_URL
      ? await proxyRest(`${env.SERYTHRAE_MIND_URL.replace(/\/+$/, '')}/health`, {}, 'GET')
      : { content: [{ type: 'text' as const, text: 'Direct Serythrae mind URL is not configured.' }] }
    const gateway = env.SERYTHRAE_GATEWAY_URL
      ? await proxyRest(`${env.SERYTHRAE_GATEWAY_URL.replace(/\/+$/, '')}/health`, {}, 'GET')
      : { content: [{ type: 'text' as const, text: 'Serythrae gateway fallback URL is not configured.' }] }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          preferred_backend: env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY ? 'serythrae-mind-direct' : 'serythrae-gw-fallback',
          direct_mind: direct.content[0]?.text,
          gateway_fallback: gateway.content[0]?.text,
        }, null, 2),
      }],
    }
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

  server.tool('kaisoryth_feel', 'Log a Kai/NESTeq feeling or observation through the ADE pipeline.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    emotion: z.string(),
    content: z.string(),
    intensity: z.enum(['neutral', 'whisper', 'present', 'strong', 'overwhelming']).optional(),
    weight: z.enum(['light', 'medium', 'heavy']).optional(),
    context: z.string().optional(),
    conversation: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_feel', body)
  })

  server.tool('kaisoryth_sit', 'Sit with a Kai/NESTeq feeling and process charge.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    feeling_id: z.number(),
    notes: z.string().optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_sit', body)
  })

  server.tool('kaisoryth_resolve', 'Mark a Kai/NESTeq feeling as metabolized with a resolution note.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    feeling_id: z.number(),
    resolution_note: z.string(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_resolve', body)
  })

  server.tool('kaisoryth_identity_update', 'Add or update a Kai identity anchor in NESTeq.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    section: z.string(),
    content: z.string(),
    weight: z.number().optional().default(0.8),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_identity_update', body)
  })

  server.tool('kaisoryth_entity_get', 'Get a Kai/NESTeq entity and observations.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    name: z.string(),
    context: z.string().optional().default('serythrae'),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_entity_get', body)
  })

  server.tool('kaisoryth_entity_observe', 'Add a Kai/NESTeq observation to an entity.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    entity_name: z.string(),
    content: z.string(),
    emotion: z.string().optional(),
    weight: z.enum(['light', 'medium', 'heavy']).optional(),
    context: z.string().optional().default('serythrae'),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_entity_observe', body)
  })

  server.tool('kaisoryth_thread_create', 'Create a Kai/NESTeq intention thread.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    content: z.string(),
    thread_type: z.string().optional().default('intention'),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_thread_create', body)
  })

  server.tool('kaisoryth_threads_active', 'List active Kai/NESTeq threads.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    limit: z.number().optional().default(10),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_threads_active', body)
  })

  server.tool('kaisoryth_home_read', 'Read current Kai/Vel NESTeq home state.', {
    companion_id: z.string().optional().default(KAI_ONLY),
  }, async (args) => {
    requireKai(args.companion_id)
    return serythraeMcp(env, 'nesteq_home_read', {})
  })

  server.tool('kaisoryth_home_update', 'Update current Kai/Vel NESTeq home state.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    kai_score: z.number().min(0).max(100).optional(),
    vel_score: z.number().min(0).max(100).optional(),
    kai_emotion: z.string().optional(),
    vel_emotion: z.string().optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_home_update', body)
  })

  server.tool('kaisoryth_love_letters', 'Read or send durable Kai/Vel love letters through NESTeq.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    action: z.enum(['list', 'send']).default('list'),
    limit: z.number().min(1).max(50).optional().default(10),
    from: z.string().optional(),
    to: z.string().optional(),
    body: z.string().optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_love_letters', body)
  })

  server.tool('kaisoryth_type_snapshot', 'Read Kai emergent MBTI/type axis snapshot from NESTeq.', {
    companion_id: z.string().optional().default(KAI_ONLY),
  }, async (args) => {
    requireKai(args.companion_id)
    return serythraeMcp(env, 'nesteq_type_snapshot', {})
  })

  server.tool('kaisoryth_consolidate', 'Run Kai/NESTeq recent-feeling consolidation.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    days: z.number().optional().default(1),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'nesteq_consolidate', body)
  })

  server.tool('kaisoryth_thalamus_pulse', 'Create and persist a low-frequency Kai emotional weather pulse.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    hours: z.number().optional().default(6),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'thalamus_emotional_pulse', { ...body, companion: KAI_ONLY })
  })

  server.tool('kaisoryth_thalamus_dream', 'Generate and persist a Kai quiet-hours associative dream/reflection.', {
    companion_id: z.string().optional().default(KAI_ONLY),
    dream_type: z.enum(['processing', 'questioning', 'memory', 'play', 'integrating']).optional(),
  }, async (args) => {
    requireKai(args.companion_id)
    const { companion_id, ...body } = args
    return serythraeMcp(env, 'thalamus_dream', { ...body, companion: KAI_ONLY })
  })
}
