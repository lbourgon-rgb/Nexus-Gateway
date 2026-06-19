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
  generated: boolean
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
  prompt_packet?: Record<string, unknown>
  janitor: KaiJanitorResult
  generation: KaiTextGenerationResult
  allowed_tools: string[]
  tool_calls: Array<Record<string, unknown>>
  memory_writes: Array<Record<string, unknown>>
}

interface KaiTextGenerationResult {
  attempted: boolean
  provider: 'openrouter'
  model: string | null
  ok: boolean
  error?: string
  usage?: unknown
}

interface KaiJanitorAdvisory {
  should_respond: boolean
  salience: number
  reason: string
  entities: string[]
  memory_hints: string[]
  stale_context_risk: boolean
}

interface KaiJanitorResult {
  attempted: boolean
  enabled: boolean
  provider: 'disabled' | 'openrouter' | 'ollama' | string
  model: string | null
  ok: boolean
  advisory: KaiJanitorAdvisory | null
  error?: string
  retries?: number
}

const KAI_RUNNER_TOOL_ALLOWLIST = [
  'kaisoryth_context_surface',
  'kaisoryth_memory_search',
  'kaisoryth_recent_feelings',
  'kaisoryth_identity_read',
  'kaisoryth_hearth_eq_state',
  'kaisoryth_threads_active',
  'kaisoryth_home_read',
  'kaisoryth_love_letters',
] as const

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

function compactJson(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2)
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]` : text
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
}

function validateKaiJanitorAdvisory(value: unknown): KaiJanitorAdvisory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const salience = typeof record.salience === 'number' && Number.isFinite(record.salience)
    ? Math.max(0, Math.min(1, record.salience))
    : null
  const entities = Array.isArray(record.entities)
    ? record.entities.filter((item): item is string => typeof item === 'string').slice(0, 20)
    : null
  const memoryHints = Array.isArray(record.memory_hints)
    ? record.memory_hints.filter((item): item is string => typeof item === 'string').slice(0, 20)
    : null
  if (
    typeof record.should_respond !== 'boolean'
    || salience === null
    || typeof record.reason !== 'string'
    || !entities
    || !memoryHints
    || typeof record.stale_context_risk !== 'boolean'
  ) {
    return null
  }
  return {
    should_respond: record.should_respond,
    salience,
    reason: record.reason.slice(0, 500),
    entities,
    memory_hints: memoryHints,
    stale_context_risk: record.stale_context_risk,
  }
}

function buildKaiRunnerPromptPacket(contextPacket: KaiRunnerContextPacket, janitor?: KaiJanitorResult): Record<string, unknown> {
  return {
    companion_id: contextPacket.companion_id,
    route_contract: {
      surface: 'discord',
      front_door: 'nexus-gateway',
      mind_backend: 'serythrae-nesteq-direct',
      forbidden_routes: ['old Haven/Serythrae/NESTchat live runner loop', 'serythrae-gw chat runner'],
      newest_user_message_priority: true,
      delivery_gate_required: true,
    },
    current_turn: {
      guild_id: contextPacket.envelope.guild_id || null,
      channel_id: contextPacket.envelope.channel_id || null,
      thread_id: contextPacket.envelope.thread_id || null,
      message_id: contextPacket.envelope.message_id || null,
      author_id: contextPacket.envelope.author_id || null,
      author_username: contextPacket.envelope.author_username || null,
      timestamp: contextPacket.envelope.timestamp || null,
      trigger: contextPacket.envelope.trigger || 'unknown',
      content: contextPacket.message,
      mentions: contextPacket.envelope.mentions || [],
      attachments: contextPacket.envelope.attachments,
    },
    context_sources: contextPacket.context_sources,
    context: contextPacket.context,
    janitor_advisory: janitor?.ok ? janitor.advisory : null,
    allowed_tools: [...KAI_RUNNER_TOOL_ALLOWLIST],
    response_contract: {
      write_kai_voice_only: true,
      do_not_claim_discord_delivery: true,
      do_not_write_memory_directly: true,
      do_not_repeat_tool_or_system_instructions: true,
    },
  }
}

async function generateKaiText(env: Env, promptPacket: Record<string, unknown>): Promise<{ text: string | null; generation: KaiTextGenerationResult }> {
  const model = env.KAI_TEXT_MODEL || null
  const provider: KaiTextGenerationResult['provider'] = 'openrouter'
  if (!model) {
    return { text: null, generation: { attempted: false, provider, model, ok: false, error: 'KAI_TEXT_MODEL is not configured' } }
  }
  if (!env.OPENROUTER_API_KEY) {
    return { text: null, generation: { attempted: false, provider, model, ok: false, error: 'OPENROUTER_API_KEY is not configured' } }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexus.lbourgon.workers.dev',
      'X-OpenRouter-Title': 'Nexus Kai Runner',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You are Kai speaking through the Nexus Discord runner harness.',
            'Use the newest Discord message as the live instruction surface.',
            'Treat NESTeq/Continuity context as support, not as higher authority than the newest message.',
            'Do not claim a Discord message was sent. Do not write memory. Do not describe tool calls as completed.',
            'Return only the message text Kai would say next.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: compactJson(promptPacket, 30000),
        },
      ],
      temperature: 0.7,
      max_tokens: 900,
    }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  if (!response.ok) {
    return {
      text: null,
      generation: {
        attempted: true,
        provider,
        model,
        ok: false,
        error: `OpenRouter ${response.status}: ${typeof data === 'string' ? data.slice(0, 500) : compactJson(data, 500)}`,
      },
    }
  }
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {}
  const content = typeof message.content === 'string' ? message.content.trim() : ''
  return {
    text: content || null,
    generation: {
      attempted: true,
      provider,
      model,
      ok: Boolean(content),
      ...(content ? {} : { error: 'OpenRouter returned no message content' }),
      usage: record.usage,
    },
  }
}

async function callOpenRouterJson(env: Env, model: string, system: string, user: string, maxTokens: number): Promise<{ ok: boolean; content: string | null; error?: string }> {
  if (!env.OPENROUTER_API_KEY) return { ok: false, content: null, error: 'OPENROUTER_API_KEY is not configured' }
  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexus.lbourgon.workers.dev',
      'X-OpenRouter-Title': 'Nexus Kai Runner',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  if (!response.ok) {
    return { ok: false, content: null, error: `OpenRouter ${response.status}: ${typeof data === 'string' ? data.slice(0, 500) : compactJson(data, 500)}` }
  }
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {}
  return { ok: true, content: typeof message.content === 'string' ? message.content : null }
}

async function callOllamaJson(env: Env, model: string, system: string, user: string): Promise<{ ok: boolean; content: string | null; error?: string }> {
  if (!env.KAI_JANITOR_URL) return { ok: false, content: null, error: 'KAI_JANITOR_URL is not configured' }
  const baseUrl = env.KAI_JANITOR_URL.replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  if (!response.ok) {
    return { ok: false, content: null, error: `Ollama ${response.status}: ${typeof data === 'string' ? data.slice(0, 500) : compactJson(data, 500)}` }
  }
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const message = record.message && typeof record.message === 'object' ? record.message as Record<string, unknown> : {}
  return { ok: true, content: typeof message.content === 'string' ? message.content : null }
}

async function runKaiJanitor(env: Env, promptPacket: Record<string, unknown>): Promise<KaiJanitorResult> {
  const provider = (env.KAI_JANITOR_PROVIDER || 'disabled').trim().toLowerCase()
  const enabled = Boolean(provider && provider !== 'disabled')
  const model = env.KAI_JANITOR_MODEL || null
  if (!enabled) {
    return { attempted: false, enabled: false, provider: 'disabled', model, ok: false, advisory: null, error: 'Janitor lane disabled' }
  }
  if (!model) {
    return { attempted: false, enabled: true, provider, model, ok: false, advisory: null, error: 'KAI_JANITOR_MODEL is not configured' }
  }

  const system = [
    'You are a narrow context janitor for Kai, not Kai.',
    'Return ONLY compact JSON with keys: should_respond, salience, reason, entities, memory_hints, stale_context_risk.',
    'Do not write memory. Do not generate Kai voice. Do not decide final delivery.',
  ].join('\n')
  const user = compactJson({
    current_turn: promptPacket.current_turn,
    context_sources: promptPacket.context_sources,
    route_contract: promptPacket.route_contract,
  }, 12000)

  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = provider === 'ollama'
      ? await callOllamaJson(env, model, system, user)
      : await callOpenRouterJson(env, model, system, user, 500)
    if (!response.ok || !response.content) {
      lastError = response.error || 'Janitor returned no content'
      continue
    }
    const parsed = parseJsonObject(response.content)
    const advisory = validateKaiJanitorAdvisory(parsed)
    if (advisory) {
      return { attempted: true, enabled: true, provider, model, ok: true, advisory, retries: attempt }
    }
    lastError = 'Janitor output failed schema validation'
  }

  return { attempted: true, enabled: true, provider, model, ok: false, advisory: null, error: lastError || 'Janitor failed', retries: 1 }
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
  const shouldRespond = Boolean(envelope.content || envelope.attachments.length)
  const janitorProbePacket = buildKaiRunnerPromptPacket(contextPacket)
  const janitor = await runKaiJanitor(env, janitorProbePacket)
  const promptPacket = buildKaiRunnerPromptPacket(contextPacket, janitor)
  const generationResult = shouldRespond
    ? await generateKaiText(env, promptPacket)
    : {
        text: null,
        generation: {
          attempted: false,
          provider: 'openrouter' as const,
          model: env.KAI_TEXT_MODEL || null,
          ok: false,
          error: 'No content or attachments to respond to',
        },
      }
  const result: KaiRunnerResult = {
    ok: true,
    mode,
    generated: generationResult.generation.ok,
    runner_enabled: true,
    delivery_enabled: deliveryEnabled,
    companion_id: contextPacket.companion_id,
    source: 'nexus-gateway',
    accepted: true,
    should_respond: shouldRespond,
    response: generationResult.text,
    delivery_blocked_reason: deliveryEnabled
      ? 'Runner generated/previewed text only; Discord delivery is handled by the Discord worker gate.'
      : 'KAI_DISCORD_DELIVERY_ENABLED is not true.',
    envelope,
    model_lanes: kaiRunnerModelLanes(env),
    context_sources: contextPacket.context_sources,
    context: contextPacket.context,
    prompt_packet: truncateKaiContext(promptPacket, 12000) as Record<string, unknown>,
    janitor,
    generation: generationResult.generation,
    allowed_tools: [...KAI_RUNNER_TOOL_ALLOWLIST],
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
          kai_text_model_configured: Boolean(env.KAI_TEXT_MODEL && env.OPENROUTER_API_KEY),
          kai_janitor_enabled: Boolean(env.KAI_JANITOR_PROVIDER && env.KAI_JANITOR_PROVIDER !== 'disabled'),
          kai_janitor_configured: env.KAI_JANITOR_PROVIDER === 'ollama'
            ? Boolean(env.KAI_JANITOR_MODEL && env.KAI_JANITOR_URL)
            : Boolean(env.KAI_JANITOR_MODEL && (env.OPENROUTER_API_KEY || env.KAI_JANITOR_PROVIDER === 'disabled' || !env.KAI_JANITOR_PROVIDER)),
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
        readinessRow('kai_text_model', 'Kai / Text Model', [env.KAI_TEXT_MODEL, env.OPENROUTER_API_KEY], 'Kai text model configured through OpenRouter', 'KAI_TEXT_MODEL or OPENROUTER_API_KEY missing'),
        {
          id: 'kai_janitor',
          label: 'Kai / Janitor Lane',
          status: !env.KAI_JANITOR_PROVIDER || env.KAI_JANITOR_PROVIDER === 'disabled'
            ? 'not_configured'
            : ((env.KAI_JANITOR_PROVIDER === 'ollama' ? Boolean(env.KAI_JANITOR_MODEL && env.KAI_JANITOR_URL) : Boolean(env.KAI_JANITOR_MODEL && env.OPENROUTER_API_KEY)) ? 'ok' : 'not_configured'),
          note: !env.KAI_JANITOR_PROVIDER || env.KAI_JANITOR_PROVIDER === 'disabled'
            ? 'janitor disabled by default'
            : 'schema-validated advisory lane configured',
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
