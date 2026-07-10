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
  return proxyMcp(env.VELASTRAHQ_GATEWAY_URL, toolName, args, env.VELASTRAHQ_GATEWAY_API_KEY, env.VELASTRAHQ_GATEWAY)
}

function velastraEqMcp(env: Env, toolName: string, args: Record<string, unknown>) {
  if (!env.VELASTRAHQ_EQ_URL && !env.VELASTRAHQ_EQ) {
    return { content: [{ type: 'text' as const, text: "Mor'zar EQ URL is not configured for this Nexus tool." }] }
  }
  if (!env.VELASTRAHQ_EQ_API_KEY) {
    return { content: [{ type: 'text' as const, text: "VELASTRAHQ_EQ_API_KEY is not configured; set it as a Worker secret to use Mor'zar direct EQ tools." }] }
  }
  return proxyMcp(env.VELASTRAHQ_EQ_URL, toolName, args, env.VELASTRAHQ_EQ_API_KEY, env.VELASTRAHQ_EQ)
}

async function morzarEqWithGatewayFallback(
  env: Env,
  directToolName: string,
  gatewayToolName: string,
  directArgs: Record<string, unknown>,
  gatewayArgs: Record<string, unknown>
) {
  const direct = await velastraEqMcp(env, directToolName, directArgs)
  const text = direct.content.map(item => item.text).join('\n')
  if (!/unauthorized|error\s+401|not configured/i.test(text)) return direct
  return velastraMcp(env, gatewayToolName, gatewayArgs)
}

export function registerVelastraHQTools(server: McpServer, env: Env) {
  server.tool('velastrahq_status', 'Read VelastraHQ gateway health.', {}, async () => {
    return proxyRest(env.VELASTRAHQ_GATEWAY_URL ? `${env.VELASTRAHQ_GATEWAY_URL}/health` : undefined, {}, 'GET', {}, env.VELASTRAHQ_GATEWAY)
  })

  server.tool('velastrahq_api_status', 'Read VelastraHQ API health.', {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/health` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })

  server.tool('morzar_eq_status', "Read Mor'zar direct EQ worker health.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_EQ_URL ? `${env.VELASTRAHQ_EQ_URL}/health` : undefined, {}, 'GET', env.VELASTRAHQ_EQ_API_KEY ? {
      Authorization: `Bearer ${env.VELASTRAHQ_EQ_API_KEY}`,
    } : {}, env.VELASTRAHQ_EQ)
  })

  server.tool('morzar_orient', "Read Mor'zar identity anchors and current context directly through VelastraHQ EQ.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return morzarEqWithGatewayFallback(env, 'nesteq_orient', 'velastrahq_orient', {}, {})
  })

  server.tool('morzar_ground', "Read Mor'zar active threads, recent feelings, and warm entities directly through VelastraHQ EQ.", {
    companion_id: z.string().optional().default('morzar'),
  }, async (args) => {
    requireMorzar(args.companion_id)
    return morzarEqWithGatewayFallback(env, 'nesteq_ground', 'velastrahq_ground', {}, {})
  })

  server.tool('morzar_memory_search', "Search Mor'zar memories and feelings directly through VelastraHQ EQ.", {
    companion_id: z.string().optional().default('morzar'),
    query: z.string(),
    n_results: z.number().optional().default(5),
    context: z.string().optional(),
  }, async (args) => {
    requireMorzar(args.companion_id)
    const directArgs = { query: args.query, n_results: args.n_results, context: args.context }
    const gatewayArgs = { query: args.query, n_results: args.n_results }
    return morzarEqWithGatewayFallback(env, 'nesteq_search', 'velastrahq_search', directArgs, gatewayArgs)
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
    return morzarEqWithGatewayFallback(
      env,
      'hearth_presence',
      'velastrahq_presence',
      { action: 'get', companion: 'morzar' },
      {}
    )
  })

  server.tool('vel_health', 'Read the shared VelastraHQ health dashboard.', {}, async () => {
    return velastraMcp(env, 'velastrahq_health', {})
  })

  server.tool('vel_home_summary', "Read Vel's shared home summary directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/summary` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })

  server.tool('vel_daily_context', "Read Vel's daily context directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/daily-context` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })

  server.tool('vel_emotional_field', "Read Vel's emotional field directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/vel/emotional-field` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })

  server.tool('vel_spoons', "Read Vel's spoon state through VelastraHQ Gateway.", {}, async () => {
    return velastraMcp(env, 'velastrahq_spoons', { action: 'get' })
  })

  server.tool('vel_spoons_direct', "Read Vel's spoon state directly from VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/spoons` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
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
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/health${suffix}` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })

  server.tool('vel_somatic_summary', "Read Vel's somatic summary through VelastraHQ API.", {}, async () => {
    return proxyRest(env.VELASTRAHQ_API_URL ? `${env.VELASTRAHQ_API_URL}/api/somatic/summary` : undefined, {}, 'GET', {}, env.VELASTRAHQ_API)
  })
}
