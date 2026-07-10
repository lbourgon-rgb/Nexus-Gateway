import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp, proxyRest } from '../proxy'

const KAI_ONLY = 'kaisoryth'

function serythraeMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  if (!env.SERYTHRAE_MIND && !env.SERYTHRAE_MIND_URL) {
    return { content: [{ type: 'text' as const, text: 'Direct Serythrae mind binding or URL is not configured.' }] }
  }
  if (!env.SERYTHRAE_MIND && !env.SERYTHRAE_MIND_API_KEY) {
    return { content: [{ type: 'text' as const, text: 'SERYTHRAE_MIND_API_KEY is required for URL-based Kai mind calls.' }] }
  }
  return proxyMcp(
    env.SERYTHRAE_MIND_URL || 'https://serythrae-mind.internal',
    toolName,
    args,
    env.SERYTHRAE_MIND_API_KEY,
    env.SERYTHRAE_MIND,
  )
}

function serythraeGatewayRest(env: Env, path: string, body: Record<string, unknown> = {}, method = 'POST') {
  const base = (env.SERYTHRAE_GATEWAY ? 'https://serythrae.internal' : env.SERYTHRAE_GATEWAY_URL || '').replace(/\/+$/, '')
  const headers: Record<string, string> = {}
  if (!env.SERYTHRAE_GATEWAY && env.SERYTHRAE_GATEWAY_API_KEY) {
    headers.Authorization = `Bearer ${env.SERYTHRAE_GATEWAY_API_KEY}`
  }
  return proxyRest(base ? `${base}${path}` : undefined, body, method, headers, env.SERYTHRAE_GATEWAY)
}

export function registerSerythraeTools(server: McpServer, env: Env) {
  server.tool('serythrae_status', 'Read Serythrae gateway health for Kai/NESTeq routing.', {}, async () => {
    const direct = env.SERYTHRAE_MIND_URL || env.SERYTHRAE_MIND
      ? await proxyRest(`${(env.SERYTHRAE_MIND_URL || 'https://serythrae-mind.internal').replace(/\/+$/, '')}/health`, {}, 'GET', {}, env.SERYTHRAE_MIND)
      : { content: [{ type: 'text' as const, text: 'Direct Serythrae mind binding or URL is not configured.' }] }
    const workspaceActuator = env.SERYTHRAE_GATEWAY_URL || env.SERYTHRAE_GATEWAY
      ? await proxyRest(`${(env.SERYTHRAE_GATEWAY_URL || 'https://serythrae.internal').replace(/\/+$/, '')}/health`, {}, 'GET', {}, env.SERYTHRAE_GATEWAY)
      : { content: [{ type: 'text' as const, text: 'Restricted workspace actuator is not configured.' }] }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          preferred_backend: 'serythrae-mind-direct',
          direct_mind: direct.content[0]?.text,
          runner_fallback: false,
          workspace_actuator: workspaceActuator.content[0]?.text,
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
