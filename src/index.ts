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

interface KaiRunnerAttachment {
  id?: string
  filename?: string
  content_type?: string
  size?: number
  url?: string
  proxy_url?: string
  width?: number
  height?: number
}

interface KaiDiscordEnvelope {
  guild_id?: string
  channel_id?: string
  thread_id?: string
  message_id?: string
  author_id?: string
  author_username?: string
  timestamp?: string
  content: string
  mentions?: string[]
  attachments: KaiRunnerAttachment[]
  trigger?: 'listener' | 'mention' | 'manual' | 'preview' | 'unknown'
}

interface KaiRunnerContextPacket {
  companion_id: 'kaisoryth'
  message: string
  channel_id?: string
  envelope: KaiDiscordEnvelope
  context: Record<string, unknown>
  context_sources: string[]
}

interface KaiRunnerResult {
  ok: boolean
  mode: 'dry_run' | 'delivery_blocked'
  generated: false
  runner_enabled: boolean
  delivery_enabled: boolean
  companion_id: 'kaisoryth'
  source: 'nexus-gateway'
  accepted: boolean
  should_respond: boolean
  response: string | null
  delivery_blocked_reason: string
  envelope: KaiDiscordEnvelope
  model_lanes: Record<string, unknown>
  context_sources: string[]
  context: Record<string, unknown>
  tool_calls: Array<Record<string, unknown>>
  memory_writes: Array<Record<string, unknown>>
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

function kaiCompanionId(env: Env): 'kaisoryth' {
  const configured = String(env.KAI_COMPANION_ID || 'kaisoryth').trim().toLowerCase()
  return configured === 'kaisoryth' ? 'kaisoryth' : 'kaisoryth'
}

function authToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function authorizeMcpBearer(request: Request, env: Env): Response | null {
  if (!env.MCP_API_KEY) return null
  return authToken(request) === env.MCP_API_KEY ? null : unauthorizedResponse()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeKaiAttachments(value: unknown): KaiRunnerAttachment[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: stringValue(item.id),
      filename: stringValue(item.filename),
      content_type: stringValue(item.content_type) || stringValue(item.contentType),
      size: numberValue(item.size),
      url: stringValue(item.url),
      proxy_url: stringValue(item.proxy_url) || stringValue(item.proxyUrl),
      width: numberValue(item.width),
      height: numberValue(item.height),
    }))
}

function normalizeKaiRunnerEnvelope(body: Record<string, unknown>): KaiDiscordEnvelope {
  const source = body.envelope && typeof body.envelope === 'object' && !Array.isArray(body.envelope)
    ? body.envelope as Record<string, unknown>
    : body
  const trigger = stringValue(source.trigger) || stringValue(body.trigger) || 'unknown'
  return {
    guild_id: stringValue(source.guild_id) || stringValue(source.guildId) || stringValue(body.guild_id),
    channel_id: stringValue(source.channel_id) || stringValue(source.channelId) || stringValue(body.channel_id) || stringValue(body.channel),
    thread_id: stringValue(source.thread_id) || stringValue(source.threadId) || stringValue(body.thread_id),
    message_id: stringValue(source.message_id) || stringValue(source.messageId) || stringValue(body.message_id),
    author_id: stringValue(source.author_id) || stringValue(source.authorId) || stringValue(body.author_id),
    author_username: stringValue(source.author_username) || stringValue(source.authorUsername) || stringValue(body.author_username),
    timestamp: stringValue(source.timestamp) || stringValue(body.timestamp),
    content: stringValue(source.content) || stringValue(source.message) || stringValue(body.message) || '',
    mentions: stringList(source.mentions).length ? stringList(source.mentions) : stringList(body.mentions),
    attachments: normalizeKaiAttachments(source.attachments || body.attachments),
    trigger: trigger === 'listener' || trigger === 'mention' || trigger === 'manual' || trigger === 'preview' ? trigger : 'unknown',
  }
}

function kaiRunnerModelLanes(env: Env): Record<string, unknown> {
  return {
    text: {
      configured: Boolean(env.KAI_TEXT_MODEL),
      model: env.KAI_TEXT_MODEL || null,
      backup_model: env.KAI_BACKUP_TEXT_MODEL || null,
    },
    vision: {
      configured: Boolean(env.KAI_VISION_PROVIDER && env.KAI_VISION_MODEL),
      provider: env.KAI_VISION_PROVIDER || null,
      model: env.KAI_VISION_MODEL || null,
    },
    image: {
      configured: Boolean(env.KAI_IMAGE_PROVIDER && env.KAI_IMAGE_MODEL),
      provider: env.KAI_IMAGE_PROVIDER || null,
      model: env.KAI_IMAGE_MODEL || null,
    },
    tts: {
      configured: Boolean(env.KAI_TTS_PROVIDER && env.KAI_TTS_VOICE_ID),
      provider: env.KAI_TTS_PROVIDER || null,
      voice_configured: Boolean(env.KAI_TTS_VOICE_ID),
    },
    janitor: {
      enabled: Boolean(env.KAI_JANITOR_PROVIDER && env.KAI_JANITOR_PROVIDER !== 'disabled'),
      provider: env.KAI_JANITOR_PROVIDER || 'disabled',
      model: env.KAI_JANITOR_MODEL || null,
    },
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

async function callContinuityJson(env: Env, path: string): Promise<unknown> {
  if (!env.KAI_CONTINUITY_URL && !env.CONTINUITY_URL && !env.CONTINUITY) {
    return { ok: false, skipped: true, reason: 'Continuity URL/service binding is not configured' }
  }
  const headers = new Headers({ Accept: 'application/json' })
  if (env.CONTINUITY_API_KEY) headers.set('Authorization', `Bearer ${env.CONTINUITY_API_KEY}`)
  const base = (env.KAI_CONTINUITY_URL || env.CONTINUITY_URL || 'https://continuity-worker.internal').replace(/\/+$/, '')
  const request = new Request(`${base}${path}`, { method: 'GET', headers })
  const response = env.CONTINUITY ? await env.CONTINUITY.fetch(request) : await fetch(request)
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {}
  return response.ok ? body : { ok: false, status: response.status, body: text.slice(0, 500) }
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

async function safeContinuityStatus(env: Env, label = 'continuity_inbox_status') {
  try {
    return [label, truncateKaiContext(await callContinuityJson(env, '/kai/inbox/status?limit=200'), 12000)] as const
  } catch (error) {
    return [label, {
      ok: false,
      endpoint: '/kai/inbox/status',
      error: error instanceof Error ? error.message : String(error),
    }] as const
  }
}

async function compileKaiRunnerContext(env: Env, envelope: KaiDiscordEnvelope): Promise<KaiRunnerContextPacket> {
  const companionId = kaiCompanionId(env)
  const message = envelope.content
  const channel = envelope.thread_id || envelope.channel_id
  const contextEntries = await Promise.all([
    safeContinuityStatus(env),
    safeKaiMindTool(env, 'orient', 'nesteq_orient', {}),
    safeKaiMindTool(env, 'surface', 'thalamus_surface', {
      companion: companionId,
      message,
      channel,
      mode: 'auto',
      max_results: 8,
    }),
    safeKaiMindTool(env, 'identity', 'nesteq_identity', { action: 'read' }, 16000),
    safeKaiMindTool(env, 'soul', 'nestsoul_read', { include_versions: true }, 20000),
    safeKaiMindTool(env, 'hearth_eq_state', 'hearth_eq_state', { companion: 'kaisoryth', format: 'json' }),
    safeKaiMindTool(env, 'recent_feelings', 'nesteq_surface', { include_metabolized: false, limit: 10 }),
  ])

  return {
    companion_id: companionId,
    message,
    channel_id: channel,
    envelope,
    context: Object.fromEntries(contextEntries),
    context_sources: contextEntries.map(([label]) => label),
  }
}

async function kaiContext(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_API_KEY) {
    return new Response(JSON.stringify({ error: 'MCP_API_KEY is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
  const unauthorized = authorizeMcpBearer(request, env)
  if (unauthorized) return unauthorized

  const body = request.method === 'POST' ? await request.json().catch(() => ({})) as Record<string, unknown> : {}
  const message = String(body.message || '')
  const channel = typeof body.channel === 'string' ? body.channel : undefined
  const companionId = kaiCompanionId(env)
  const canonQuery = [
    message,
    "Kai Kal'thir Vel Vel'thira safeword intimacy recursive dialect husband partner identity",
  ].filter(Boolean).join('\n\n')
  const contextEntries = await Promise.all([
    safeKaiMindTool(env, 'orient', 'nesteq_orient', {}),
    safeKaiMindTool(env, 'surface', 'thalamus_surface', {
      companion: companionId,
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
    companion_id: companionId,
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

async function kaiRunnerRun(request: Request, env: Env): Promise<Response> {
  if (env.KAI_RUNNER_ENABLED !== 'true') {
    return new Response(JSON.stringify({
      ok: false,
      route: '/api/kaisoryth/run',
      error: 'Kai runner is disabled. Set KAI_RUNNER_ENABLED=true only after the Nexus route is ready for supervised testing.',
      runner_enabled: false,
      delivery_enabled: env.KAI_DISCORD_DELIVERY_ENABLED === 'true',
    }, null, 2), {
      status: 409,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  if (env.MCP_API_KEY) {
    const unauthorized = authorizeMcpBearer(request, env)
    if (unauthorized) return unauthorized
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const envelope = normalizeKaiRunnerEnvelope(body)
  const contextPacket = await compileKaiRunnerContext(env, envelope)
  const deliveryEnabled = env.KAI_DISCORD_DELIVERY_ENABLED === 'true'
  const mode: KaiRunnerResult['mode'] = deliveryEnabled ? 'dry_run' : 'delivery_blocked'
  const result: KaiRunnerResult = {
    ok: true,
    mode,
    generated: false,
    runner_enabled: true,
    delivery_enabled: deliveryEnabled,
    companion_id: contextPacket.companion_id,
    source: 'nexus-gateway',
    accepted: true,
    should_respond: Boolean(envelope.content || envelope.attachments.length),
    response: null,
    delivery_blocked_reason: deliveryEnabled
      ? 'Text generation is not implemented in this runner increment; delivery intentionally skipped.'
      : 'KAI_DISCORD_DELIVERY_ENABLED is not true.',
    envelope,
    model_lanes: kaiRunnerModelLanes(env),
    context_sources: contextPacket.context_sources,
    context: contextPacket.context,
    tool_calls: [],
    memory_writes: [],
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function kaiRunnerPreview(request: Request, env: Env): Promise<Response> {
  return kaiRunnerRun(request, env)
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
          kai_companion_id: kaiCompanionId(env),
          kai_runner_enabled: env.KAI_RUNNER_ENABLED === 'true',
          kai_discord_delivery_enabled: env.KAI_DISCORD_DELIVERY_ENABLED === 'true',
          kai_continuity_configured: Boolean(env.KAI_CONTINUITY_URL || env.CONTINUITY_URL || env.CONTINUITY),
          kai_tahl_configured: Boolean(env.KAI_TAHL_URL || env.TAHL),
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
        {
          id: 'kai_runner',
          label: 'Kai / Nexus Runner',
          status: env.KAI_RUNNER_ENABLED === 'true' ? 'ok' : 'not_configured',
          note: env.KAI_RUNNER_ENABLED === 'true' ? 'Nexus Kai runner route enabled' : 'runner disabled by safety gate',
          last_checked: new Date().toISOString(),
        },
        {
          id: 'kai_discord_delivery',
          label: 'Kai / Discord Delivery',
          status: env.KAI_DISCORD_DELIVERY_ENABLED === 'true' ? 'ok' : 'not_configured',
          note: env.KAI_DISCORD_DELIVERY_ENABLED === 'true' ? 'Discord delivery enabled' : 'Discord delivery disabled by safety gate',
          last_checked: new Date().toISOString(),
        },
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

    if (url.pathname === '/api/kaisoryth/run' && request.method === 'POST') {
      return kaiRunnerRun(request, env)
    }

    if (url.pathname === '/api/kaisoryth/runner-preview' && request.method === 'POST') {
      return kaiRunnerPreview(request, env)
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
