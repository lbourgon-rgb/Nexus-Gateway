import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp, proxyRest } from '../proxy'
import { requireCompanionId } from '../identity'

function requireMorzar(companionInput: unknown) {
  const companionId = requireCompanionId(companionInput)
  if (companionId !== 'morzar') {
    throw new Error(`VelastraHQ Mor'zar tools require companion_id=morzar. Received ${companionId}.`)
  }
  return companionId
}

function velastraMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  return proxyMcp(env.VELASTRAHQ_GATEWAY_URL, toolName, args, env.VELASTRAHQ_GATEWAY_API_KEY)
}

export function registerVelastraHQTools(server: McpServer, env: Env) {
  server.tool('velastrahq_status', 'Read VelastraHQ gateway health.', {}, async () => {
    return proxyRest(env.VELASTRAHQ_GATEWAY_URL ? `${env.VELASTRAHQ_GATEWAY_URL}/health` : undefined, {}, 'GET')
  })

  server.tool('velastrahq_api_status', 'Read VelastraHQ API health.', {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/health` : undefined, {}, 'GET')
  })

  server.tool('morzar_orient', "Read Mor'zar identity anchors and current context through VelastraHQ Gateway.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_orient', {})
  })

  server.tool('morzar_ground', "Read Mor'zar active threads, recent feelings, and warm entities.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_ground', {})
  })

  server.tool('morzar_memory_search', "Search Mor'zar memories and feelings through VelastraHQ Gateway.", {
    companion_id: z.string().optional().default('morzar'),
    query: z.string(),
    n_results: z.number().optional().default(5),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_search', {
      query: args.query,
      n_results: args.n_results,
    })
  })

  server.tool('morzar_journals', "Read Mor'zar journals through VelastraHQ Gateway.", {
    companion_id: z.string().optional().default('morzar'),
    limit: z.number().optional().default(10),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_journals', { limit: args.limit })
  })

  server.tool('morzar_mind_health', "Read Mor'zar mind health dashboard data.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_mind_health', {})
  })

  server.tool('morzar_presence', "Read Mor'zar presence state.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return velastraMcp(env, 'velastrahq_presence', {})
  })

  server.tool('vel_health', 'Read the shared VelastraHQ health dashboard.', {}, async () => {
    return velastraMcp(env, 'velastrahq_health', {})
  })

  server.tool('vel_home_summary', "Read Vel's shared home summary directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/summary` : undefined, {}, 'GET')
  })

  server.tool('vel_daily_context', "Read Vel's daily context directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/daily-context` : undefined, {}, 'GET')
  })

  server.tool('vel_emotional_field', "Read Vel's emotional field directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/emotional-field` : undefined, {}, 'GET')
  })

  server.tool('vel_spoons', "Read Vel's spoon state through VelastraHQ Gateway.", {}, async () => {
    return velastraMcp(env, 'velastrahq_spoons', { action: 'get' })
  })

  server.tool('vel_spoons_direct', "Read Vel's spoon state directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/spoons` : undefined, {}, 'GET')
  })

  server.tool('vel_biometrics', 'Read Vel biometrics through VelastraHQ Gateway.', {
    days: z.number().optional(),
    date: z.string().optional(),
  }, async (args) => {
    return velastraMcp(env, 'velastrahq_biometrics', { action: 'get', ...args })
  })

  server.tool('vel_health_direct', 'Read Vel health data directly from VelastraHQ API.', {
    days: z.number().optional(),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.days) params.set('days', String(args.days))
    const suffix = params.toString() ? `?${params}` : ''
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/health${suffix}` : undefined, {}, 'GET')
  })

  server.tool('vel_somatic_summary', "Read Vel's somatic summary through VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/somatic/summary` : undefined, {}, 'GET')
  })
}
