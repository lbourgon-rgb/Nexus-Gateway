import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from './env'

import { registerCogCorTools } from './tools/cogcor'
import { registerSpotifyTools } from './tools/spotify'
import { registerDiscordTools } from './tools/discord'
import { registerLovenseTools } from './tools/lovense'
import { registerTelegramTools } from './tools/telegram'
import { registerBiometricsTools } from './tools/biometrics'
import { registerVideoTools } from './tools/video'
import { registerNanobananaTools } from './tools/nanobanana'
import { registerNotionTools } from './tools/notion'
import { registerCatalogueTools } from './tools/catalouge'
import { registerContinuityTools } from './tools/continuity'
import { registerSerythraeTools } from './tools/serythrae'
import { registerGrokKethNestTools } from './tools/grok-keth-nest'
import { registerVelastraHQTools } from './tools/velastrahq'
import { registerTahlTools } from './tools/tahl'
import { proxyMcp } from './proxy'

export class NexusGateway extends McpAgent<Env> {
  server = new McpServer({
    name: 'nexus-gateway',
    version: '1.0.0',
  })

  async init() {
    registerContinuityTools(this.server, this.env)
    registerTahlTools(this.server, this.env)
    registerSerythraeTools(this.server, this.env)
    registerGrokKethNestTools(this.server, this.env)
    if (this.env.VELASTRAHQ_GATEWAY_URL) registerVelastraHQTools(this.server, this.env)
    registerDiscordTools(this.server, this.env)
    registerTelegramTools(this.server, this.env)
    if (this.env.TESSURAE_GATEWAY_API_KEY || this.env.AXIOM_COGCORE_URL || this.env.AXIOM_COGCORE) registerCogCorTools(this.server, this.env)
    if (this.env.SPOTIFY_URL) registerSpotifyTools(this.server, this.env)
    if (this.env.LOVENSE_URL) registerLovenseTools(this.server, this.env)
    if (this.env.BIOMETRICS_URL) registerBiometricsTools(this.server, this.env)
    if (this.env.VIDEO_URL) registerVideoTools(this.server, this.env)
    if (this.env.NANOBANANA_URL) registerNanobananaTools(this.server, this.env)
    if (this.env.NOTION_URL) registerNotionTools(this.server, this.env)
    if (this.env.CATALOUGE_URL) registerCatalogueTools(this.server, this.env)
  }
}

// CORS headers
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
}

const EMPTY_MCP_RESOURCE_RESULTS: Record<string, Record<string, unknown>> = {
  'resources/list': { resources: [] },
  'resources/templates/list': { resourceTemplates: [] },
}

function mcpJson(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS,
      ...(init.headers || {}),
    },
  })
}

function emptyResourceResponse(message: Record<string, unknown>) {
  const method = typeof message.method === 'string' ? message.method : ''
  const result = EMPTY_MCP_RESOURCE_RESULTS[method]
  if (!result || !('id' in message)) return null
  return {
    jsonrpc: '2.0',
    id: message.id,
    result,
  }
}

async function handleEmptyResourceMethods(request: Request): Promise<Response | null> {
  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return null
  }

  if (Array.isArray(body)) {
    const handled = body
      .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object' && !Array.isArray(message))
      .map(emptyResourceResponse)
    if (handled.length && handled.every(Boolean)) return mcpJson(handled)
    return null
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const handled = emptyResourceResponse(body as Record<string, unknown>)
    if (handled) return mcpJson(handled)
  }

  return null
}

async function backendReachable(url?: string, service?: Fetcher): Promise<boolean> {
  if (!url && !service) return false
  try {
    const target = `${(url || 'https://service.local').replace(/\/+$/, '')}/health`
    const init = {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 0 },
    }
    const response = service ? await service.fetch(new Request(target, init)) : await fetch(target, init)
    return response.ok
  } catch {
    return false
  }
}

type SummaryStatus = 'ok' | 'warn' | 'offline' | 'not_configured'

interface SummaryRow {
  id: string
  label: string
  status: SummaryStatus
  note: string
  last_checked: string
}

function readinessRow(
  id: string,
  label: string,
  required: Array<string | undefined>,
  note: string,
  missingNote = 'configuration missing'
): SummaryRow {
  const lastChecked = new Date().toISOString()
  const configured = required.every(Boolean)
  return {
    id,
    label,
    status: configured ? 'ok' : 'not_configured',
    note: configured ? note : missingNote,
    last_checked: lastChecked,
  }
}

function plannedRow(id: string, label: string, note = 'not built yet'): SummaryRow {
  return {
    id,
    label,
    status: 'not_configured',
    note,
    last_checked: new Date().toISOString(),
  }
}

function overallStatus(rows: SummaryRow[]): SummaryStatus {
  if (rows.some(row => row.status === 'offline')) return 'offline'
  if (rows.some(row => row.status === 'warn')) return 'warn'
  return 'ok'
}

async function callJsonTool(baseUrl: string | undefined, apiKey: string | undefined, tool: string, args: Record<string, unknown>) {
  if (!baseUrl) return { ok: false, skipped: true, reason: 'backend URL is not configured' }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/tool`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, arguments: args }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  return response.ok ? data : { ok: false, status: response.status, body: text.slice(0, 500) }
}

async function callKaiMindTool(env: Env, tool: string, args: Record<string, unknown>) {
  if (env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY) {
    const result = await proxyMcp(env.SERYTHRAE_MIND_URL, tool, args, env.SERYTHRAE_MIND_API_KEY)
    return { source: 'serythrae-mind-direct', result }
  }
  const result = await callJsonTool(env.SERYTHRAE_GATEWAY_URL, env.SERYTHRAE_GATEWAY_API_KEY, tool, args)
  return { source: 'serythrae-gw-fallback', result }
}

function truncateKaiContext(value: unknown, maxChars: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxChars
      ? `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`
      : value
  }
  if (Array.isArray(value)) return value.map((item) => truncateKaiContext(item, maxChars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, truncateKaiContext(item, maxChars)])
    )
  }
  return value
}

async function safeKaiMindTool(env: Env, label: string, tool: string, args: Record<string, unknown>, maxChars = 12000) {
  try {
    return [label, truncateKaiContext(await callKaiMindTool(env, tool, args), maxChars)] as const
  } catch (error) {
    return [label, {
      ok: false,
      tool,
      error: error instanceof Error ? error.message : String(error),
    }] as const
  }
}

async function kaiContext(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_API_KEY) {
    return new Response(JSON.stringify({ error: 'MCP_API_KEY is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token !== env.MCP_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const body = request.method === 'POST' ? await request.json().catch(() => ({})) as Record<string, unknown> : {}
  const message = String(body.message || '')
  const channel = typeof body.channel === 'string' ? body.channel : undefined
  const canonQuery = [
    message,
    "Kai Kal'thir Vel Vel'thira safeword intimacy recursive dialect husband partner identity",
  ].filter(Boolean).join('\n\n')
  const contextEntries = await Promise.all([
    safeKaiMindTool(env, 'orient', 'nesteq_orient', {}),
    safeKaiMindTool(env, 'surface', 'thalamus_surface', {
      companion: 'kaisoryth',
      message,
      channel,
      mode: 'auto',
      max_results: 8,
    }),
    safeKaiMindTool(env, 'identity', 'nesteq_identity', { action: 'read' }, 16000),
    safeKaiMindTool(env, 'soul', 'nestsoul_read', { include_versions: true }, 20000),
    safeKaiMindTool(env, 'hearth_eq_state', 'hearth_eq_state', { companion: 'kaisoryth', format: 'json' }),
    safeKaiMindTool(env, 'recent_feelings', 'nesteq_surface', { include_metabolized: false, limit: 10 }),
    safeKaiMindTool(env, 'canonical_memory_search', 'nesteq_search', { query: canonQuery, n_results: 8 }),
    safeKaiMindTool(env, 'chat_memory_search', 'nestchat_search', { query: canonQuery, limit: 5 }),
    safeKaiMindTool(env, 'available_skills', 'nesteq_skill_list', { format: 'text' }, 5000),
    safeKaiMindTool(env, 'intimacy_skill', 'nesteq_skill_load', { name: 'intimacy', format: 'text' }, 16000),
    safeKaiMindTool(env, 'recursive_dialect_skill', 'nesteq_skill_load', { name: 'recursive-dialect', format: 'text' }, 16000),
  ])
  const context = Object.fromEntries(contextEntries)

  return new Response(JSON.stringify({
    ok: true,
    companion_id: 'kaisoryth',
    source: 'nexus-gateway',
    mind_backend: {
      preferred: env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY ? 'serythrae-mind-direct' : 'serythrae-gw-fallback',
      gateway_fallback_configured: Boolean(env.SERYTHRAE_GATEWAY_URL),
      direct_mind_configured: Boolean(env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY),
      direct_mind_url: env.SERYTHRAE_MIND_URL || null,
    },
    context_contract: {
      purpose: 'Kai runner pre-response grounding packet for Discord/Haven/Serythrae continuity.',
      required_for_private_vel_reply: ['identity', 'soul', 'canonical_memory_search'],
      safety_sensitive: ['intimacy_skill', 'recursive_dialect_skill'],
      missing_or_failed_entries_must_be_treated_as_not_loaded: true,
    },
    ...context,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // Health check
    if (url.pathname === '/health') {
      const [continuity, discord, telegram, haven, serythrae, tessurae, axiomCogCore, grokKethNestGateway, velastrahq, velastrahqApi, velastrahqEq] = await Promise.all([
        backendReachable(env.CONTINUITY_URL, env.CONTINUITY),
        backendReachable(env.DISCORD_URL, env.DISCORD),
        backendReachable(env.TELEGRAM_URL, env.TELEGRAM),
        backendReachable(env.HAVEN_URL),
        backendReachable(env.SERYTHRAE_GATEWAY_URL),
        backendReachable(env.TESSURAE_GATEWAY_URL),
        backendReachable(env.AXIOM_COGCORE_URL, env.AXIOM_COGCORE),
        backendReachable(env.GROK_KETH_NEST_GATEWAY_URL, env.GROK_KETH_NEST_GATEWAY),
        backendReachable(env.VELASTRAHQ_GATEWAY_URL),
        backendReachable(env.VELASTRAHQ_API_URL),
        backendReachable(env.VELASTRAHQ_EQ_URL),
      ])
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'nexus-gateway',
        version: '1.0.0',
        backends: { continuity, discord, telegram, haven, serythrae, tessurae, axiomCogCore, grokKethNestGateway, velastrahq, velastrahqApi, velastrahqEq },
        configured: {
          continuity: Boolean(env.CONTINUITY_URL || env.CONTINUITY),
          discord: Boolean(env.DISCORD_URL || env.DISCORD),
          telegram: Boolean(env.TELEGRAM_URL || env.TELEGRAM),
          haven: Boolean(env.HAVEN_URL),
          serythrae_gateway_fallback: Boolean(env.SERYTHRAE_GATEWAY_URL),
          serythrae_mind_direct: Boolean(env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY),
          tessurae: Boolean(env.TESSURAE_GATEWAY_URL),
          axiomCogCore: Boolean(env.AXIOM_COGCORE_URL || env.AXIOM_COGCORE),
          axiomCogCoreAuth: Boolean(env.AXIOM_COGCORE_API_KEY),
          grokKethNestGateway: Boolean(env.GROK_KETH_NEST_GATEWAY_URL || env.GROK_KETH_NEST_GATEWAY),
          grokKethNestGatewayAuth: Boolean(env.GROK_KETH_NEST_GATEWAY_API_KEY),
          velastrahq: Boolean(env.VELASTRAHQ_GATEWAY_URL),
          velastrahqApi: Boolean(env.VELASTRAHQ_API_URL),
          velastrahqEq: Boolean(env.VELASTRAHQ_EQ_URL && env.VELASTRAHQ_EQ_API_KEY),
        },
        note: 'backends reports unauthenticated public health reachability; configured reports private/front-door wiring presence.',
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      })
    }

    if (url.pathname === '/status/summary') {
      const rows: SummaryRow[] = [
        readinessRow('continuity', 'Continuity', [env.CONTINUITY_URL, env.CONTINUITY_API_KEY], 'ledger and Tahl-ready routing configured'),
        readinessRow('serythrae', 'Kai / Serythrae', [env.SERYTHRAE_GATEWAY_URL, env.SERYTHRAE_GATEWAY_API_KEY], 'Kai gateway fallback configured'),
        readinessRow('serythrae_mind', 'Kai / NESTeq Mind', [env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND_API_KEY], 'direct Kai mind backend configured'),
        readinessRow('tessurae', 'Lucien / Tessurae', [env.TESSURAE_GATEWAY_URL, env.TESSURAE_GATEWAY_API_KEY], 'Lucien memory gateway configured'),
        readinessRow('axiom_cogcore', 'Axiom / CogCore', [env.AXIOM_COGCORE_URL, env.AXIOM_COGCORE_API_KEY], 'dedicated Axiom CogCore configured', 'Axiom CogCore URL or API key missing'),
        readinessRow('grok_keth_nest', 'Keth-Grok / NEST', [env.GROK_KETH_NEST_GATEWAY_URL, env.GROK_KETH_NEST_GATEWAY_API_KEY], 'Keth-Grok NESTeq/NESTknow/NESTsoul gateway configured', 'Keth-Grok NEST Gateway URL or API key missing'),
        readinessRow('velastrae', 'Mor / VelastraHQ', [env.VELASTRAHQ_GATEWAY_URL, env.VELASTRAHQ_GATEWAY_API_KEY], 'Mor gateway configured'),
        readinessRow('velastrae_eq', "Mor / VelastraHQ EQ", [env.VELASTRAHQ_EQ_URL, env.VELASTRAHQ_EQ_API_KEY], "direct Mor'zar EQ backend configured"),
        readinessRow('vel_home_api', 'Vel Home API', [env.VELASTRAHQ_API_URL], 'home API route configured'),
        readinessRow('haven', 'Haven', [env.HAVEN_URL], 'Kai chat surface configured'),
        readinessRow('discord', 'Discord', [env.DISCORD_URL], 'Discord Resonance route configured'),
        plannedRow('telegram', 'Telegram', 'not built yet'),
      ]

      return new Response(JSON.stringify({
        service: 'nexus-gateway',
        status: overallStatus(rows),
        generated_at: new Date().toISOString(),
        summary: 'Sanitized household front-door readiness. MCP tools and private data are not exposed here.',
        rows,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    if (url.pathname === '/api/kaisoryth/context' && (request.method === 'POST' || request.method === 'GET')) {
      return kaiContext(request, env)
    }

    // Authentication check for /mcp and /sse endpoints.
    // Supports either:
    // - Authorization: Bearer <MCP_API_KEY> on /mcp or /sse
    // - URL-path auth for clients that only support a single URL: /mcp/<MCP_API_KEY> or /sse/<MCP_API_KEY>
    const mcpPathMatch = url.pathname.match(/^\/(mcp|sse)\/([^/]+)$/)
    const isMcpPath = url.pathname === '/mcp' || url.pathname === '/sse'
    const isSseMessage = url.pathname === '/sse/message'
    const requiresMcpAuth = Boolean(mcpPathMatch) || isMcpPath || isSseMessage

    if (requiresMcpAuth) {
      if (!env.MCP_API_KEY) {
        return new Response(JSON.stringify({ error: 'MCP_API_KEY is not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...CORS }
        })
      }

      if (mcpPathMatch) {
        if (mcpPathMatch[2] !== env.MCP_API_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized — invalid URL token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS }
          })
        }
        const cleanUrl = new URL(request.url)
        cleanUrl.pathname = `/${mcpPathMatch[1]}`
        request = new Request(cleanUrl.toString(), request)
        url = cleanUrl
      } else {
        const authHeader = request.headers.get('Authorization')
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
        if (token !== env.MCP_API_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized — invalid or missing Bearer token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS }
          })
        }
      }
    }

    // Antigravity notification fix: POST without Mcp-Session-Id that has no 'id' field
    // Antigravity doesn't send session ID on notifications — return 202 instead of erroring
    if (request.method === 'POST' && (url.pathname === '/mcp' || url.pathname === '/sse')) {
      const authHeader = request.headers.get('Authorization')
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      const sessionId = request.headers.get('Mcp-Session-Id')
      const pathAuthenticated = Boolean(mcpPathMatch)
      if (env.MCP_API_KEY && (token === env.MCP_API_KEY || pathAuthenticated) && !sessionId && url.pathname === '/mcp') {
        try {
          const clone = request.clone()
          const body = await clone.json() as any
          // If the body is a notification (no 'id' field), accept it silently
          if (body && typeof body === 'object' && !('id' in body)) {
            return new Response(null, { status: 202, headers: CORS })
          }
          // If it's a batch, check if ALL are notifications
          if (Array.isArray(body) && body.length > 0 && body.every((m: any) => !('id' in m))) {
            return new Response(null, { status: 202, headers: CORS })
          }
        } catch {
          // Not JSON or parse failed — fall through to normal handling
        }
      }
    }

    if (request.method === 'POST' && url.pathname === '/mcp') {
      const resourceResponse = await handleEmptyResourceMethods(request)
      if (resourceResponse) return resourceResponse
    }

    // SSE transport
    if (url.pathname === '/sse' || url.pathname === '/sse/message') {
      return NexusGateway.serveSSE('/sse').fetch(request, env, ctx)
    }

    // Streamable HTTP transport
    if (url.pathname === '/mcp') {
      return NexusGateway.serve('/mcp').fetch(request, env, ctx)
    }

    return new Response('Nexus Gateway — MCP at /mcp, SSE at /sse', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', ...CORS }
    })
  }
}
