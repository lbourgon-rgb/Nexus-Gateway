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
import { registerVelastraHQTools } from './tools/velastrahq'
import { registerTahlTools } from './tools/tahl'

export class NexusGateway extends McpAgent<Env> {
  server = new McpServer({
    name: 'nexus-gateway',
    version: '1.0.0',
  })

  async init() {
    registerContinuityTools(this.server, this.env)
    registerTahlTools(this.server, this.env)
    registerSerythraeTools(this.server, this.env)
    if (this.env.VELASTRAHQ_GATEWAY_URL) registerVelastraHQTools(this.server, this.env)
    registerDiscordTools(this.server, this.env)
    registerTelegramTools(this.server, this.env)
    if (this.env.TESSURAE_GATEWAY_API_KEY) registerCogCorTools(this.server, this.env)
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
  const gatewayUrl = env.SERYTHRAE_GATEWAY_URL
  const gatewayKey = env.SERYTHRAE_GATEWAY_API_KEY

  const [orient, surface] = await Promise.all([
    callJsonTool(gatewayUrl, gatewayKey, 'nesteq_orient', {}),
    callJsonTool(gatewayUrl, gatewayKey, 'thalamus_surface', {
      companion: 'kaisoryth',
      message,
      channel,
      mode: 'auto',
      max_results: 5,
    }),
  ])

  return new Response(JSON.stringify({
    ok: true,
    companion_id: 'kaisoryth',
    source: 'nexus-gateway',
    mind_backend: {
      gateway_configured: Boolean(env.SERYTHRAE_GATEWAY_URL),
      direct_mind_configured: Boolean(env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY),
      direct_mind_url: env.SERYTHRAE_MIND_URL || null,
    },
    orient,
    surface,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // Health check
    if (url.pathname === '/health') {
      const [continuity, discord, telegram, haven, serythrae, tessurae, velastrahq, velastrahqApi] = await Promise.all([
        backendReachable(env.CONTINUITY_URL, env.CONTINUITY),
        backendReachable(env.DISCORD_URL, env.DISCORD),
        backendReachable(env.TELEGRAM_URL, env.TELEGRAM),
        backendReachable(env.HAVEN_URL),
        backendReachable(env.SERYTHRAE_GATEWAY_URL),
        backendReachable(env.TESSURAE_GATEWAY_URL),
        backendReachable(env.VELASTRAHQ_GATEWAY_URL),
        backendReachable(env.VELASTRAHQ_API_URL),
      ])
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'nexus-gateway',
        version: '1.0.0',
        backends: { continuity, discord, telegram, haven, serythrae, tessurae, velastrahq, velastrahqApi },
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
        readinessRow('velastrae', 'Mor / VelastraHQ', [env.VELASTRAHQ_GATEWAY_URL, env.VELASTRAHQ_GATEWAY_API_KEY], 'Mor gateway configured'),
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

    // Antigravity notification fix: POST without Mcp-Session-Id that has no 'id' field
    // Antigravity doesn't send session ID on notifications — return 202 instead of erroring
    if (request.method === 'POST' && (url.pathname === '/mcp' || url.pathname === '/sse')) {
      const authHeader = request.headers.get('Authorization')
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      const sessionId = request.headers.get('Mcp-Session-Id')
      if (env.MCP_API_KEY && token === env.MCP_API_KEY && !sessionId && url.pathname === '/mcp') {
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

    // Authentication check for /mcp and /sse endpoints.
    if (url.pathname === '/mcp' || url.pathname === '/sse' || url.pathname === '/sse/message') {
      if (!env.MCP_API_KEY) {
        return new Response(JSON.stringify({ error: 'MCP_API_KEY is not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...CORS }
        })
      }
      const authHeader = request.headers.get('Authorization')
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      if (token !== env.MCP_API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized — invalid or missing Bearer token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS }
        })
      }
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
