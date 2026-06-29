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
    if (this.env.VELASTRAHQ_GATEWAY_URL || this.env.VELASTRAHQ_GATEWAY || this.env.VELASTRAHQ_API_URL || this.env.VELASTRAHQ_API) registerVelastraHQTools(this.server, this.env)
    registerDiscordTools(this.server, this.env)
    registerTelegramTools(this.server, this.env)
    if (this.env.TESSURAE_COGCORE || this.env.TESSURAE_COGCORE_URL || this.env.AXIOM_COGCORE_URL || this.env.AXIOM_COGCORE) registerCogCorTools(this.server, this.env)
    if (this.env.SPOTIFY_URL) registerSpotifyTools(this.server, this.env)
    if (this.env.LOVENSE_URL) registerLovenseTools(this.server, this.env)
    if (this.env.BIOMETRICS_URL) registerBiometricsTools(this.server, this.env)
    if (this.env.VIDEO_URL) registerVideoTools(this.server, this.env)
    if (this.env.NANOBANANA_URL) registerNanobananaTools(this.server, this.env)
    if (this.env.NOTION_URL) registerNotionTools(this.server, this.env)
    if (this.env.CATALOUGE_URL || this.env.CATALOUGE) registerCatalogueTools(this.server, this.env)
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

const DEFAULT_KAI_VISION_MODELS = [
  'google/gemini-2.5-flash',
]

const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024

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
  recent_context?: string
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
  vision: KaiVisionResult
  image_generation: KaiImageGenerationResult
  tts: KaiTtsResult
  janitor: KaiJanitorResult
  catalouge_reading: KaiCatalougeReadingResult
  generation: KaiTextGenerationResult
  allowed_tools: string[]
  tool_calls: Array<Record<string, unknown>>
  memory_writes: Array<Record<string, unknown>>
}

interface KaiVisionSummary {
  attachment_id?: string
  filename?: string
  content_type?: string
  model?: string | null
  summary: string
}

interface KaiVisionResult {
  attempted: boolean
  enabled: boolean
  provider: 'disabled' | 'openrouter' | string
  model: string | null
  ok: boolean
  summaries: KaiVisionSummary[]
  skipped: KaiRunnerAttachment[]
  error?: string
}

interface KaiGeneratedImage {
  index: number
  mime_type?: string
  data_url_preview?: string
  url?: string
  stored_url?: string
  r2_key?: string
  storage_error?: string
  byte_length_estimate?: number
}

interface KaiImageGenerationResult {
  attempted: boolean
  enabled: boolean
  provider: 'disabled' | 'openrouter' | string
  model: string | null
  ok: boolean
  prompt: string | null
  reference_count?: number
  images: KaiGeneratedImage[]
  error?: string
}

interface KaiTtsAudioMetadata {
  content_type: string
  byte_length: number
  output_format: string
}

interface KaiTtsResult {
  attempted: boolean
  enabled: boolean
  provider: 'disabled' | 'elevenlabs' | string
  model: string | null
  voice_id_configured: boolean
  ok: boolean
  text_chars: number
  audio: KaiTtsAudioMetadata | null
  error?: string
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
  'kaisoryth_nestsoul_read',
  'kaisoryth_home_read',
  'kaisoryth_love_letters',
  'social_graph_lookup',
  'social_graph_upsert_person',
  'social_graph_add_fact',
  'social_graph_recent',
  'social_graph_log_miss',
  'social_engagement_decide',
  'kai_image_reference_store',
  'kai_image_reference_list',
  'kai_image_asset_store',
  'catalouge_list_books',
  'catalouge_search_books',
  'catalouge_get_book',
  'catalouge_get_progress',
  'catalouge_get_annotations',
  'catalouge_next_read_session',
  'catalouge_checkpoint_read_session',
] as const

interface KaiCatalougeReadingResult {
  attempted: boolean
  requested: boolean
  ok: boolean
  companion: 'kaisoryth'
  book_id: string | null
  book_title: string | null
  response: string | null
  error?: string
  progress?: unknown
  annotations?: unknown
  sessions: Array<Record<string, unknown>>
  checkpoint_summaries: string[]
  tool_calls: Array<Record<string, unknown>>
}

function readinessRow(
  id: string,
  label: string,
  required: unknown[],
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

function isInternalNexusServiceRequest(request: Request): boolean {
  return new URL(request.url).hostname === 'nexus.internal'
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function envText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const trimmed = value.trim()
  const assignment = trimmed.match(/^[A-Z0-9_]+\s*=\s*([\s\S]+)$/i)
  return assignment ? assignment[1].trim() : trimmed
}

function envFlag(value: unknown): boolean {
  return envText(value).toLowerCase() === 'true'
}

function envChoice(value: unknown, fallback = ''): string {
  return envText(value, fallback).toLowerCase()
}

function envPresent(value: unknown): boolean {
  return envText(value).length > 0
}

function envProviderEnabled(value: unknown): boolean {
  const provider = envChoice(value, 'disabled')
  return Boolean(provider && provider !== 'disabled')
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function csvStringList(value: unknown): string[] {
  if (Array.isArray(value)) return stringList(value)
  if (typeof value !== 'string') return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map(value => typeof value === 'string' ? value.trim() : '')
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
}

function canonicalKaiModelId(value: string | null | undefined): string | null {
  if (!value) return null
  if (value === 'google/gemini-2.5-flash-lite') return 'google/gemini-2.5-flash'
  return value
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
    recent_context: stringValue(source.recent_context) || stringValue(source.recentContext) || stringValue(body.recent_context) || stringValue(body.recentContext),
    mentions: stringList(source.mentions).length ? stringList(source.mentions) : stringList(body.mentions),
    attachments: normalizeKaiAttachments(source.attachments || body.attachments),
    trigger: trigger === 'listener' || trigger === 'mention' || trigger === 'manual' || trigger === 'preview' ? trigger : 'unknown',
  }
}

function kaiRunnerModelLanes(env: Env): Record<string, unknown> {
  return {
    text: {
      configured: envPresent(env.KAI_TEXT_MODEL),
      model: envText(env.KAI_TEXT_MODEL) || null,
      backup_model: envText(env.KAI_BACKUP_TEXT_MODEL) || null,
    },
    vision: {
      configured: envProviderEnabled(env.KAI_VISION_PROVIDER) && kaiVisionModels(env).length > 0,
      provider: envChoice(env.KAI_VISION_PROVIDER) || null,
      model: envText(env.KAI_VISION_MODEL) || kaiVisionModels(env)[0] || null,
      fallback_models: kaiVisionModels(env).slice(1),
    },
    image: {
      configured: envProviderEnabled(env.KAI_IMAGE_PROVIDER) && envPresent(env.KAI_IMAGE_MODEL),
      provider: envChoice(env.KAI_IMAGE_PROVIDER) || null,
      model: envText(env.KAI_IMAGE_MODEL) || null,
    },
    tts: {
      configured: envProviderEnabled(env.KAI_TTS_PROVIDER) && envPresent(env.KAI_TTS_VOICE_ID),
      provider: envChoice(env.KAI_TTS_PROVIDER) || null,
      voice_configured: envPresent(env.KAI_TTS_VOICE_ID),
      model: envText(env.KAI_TTS_MODEL, 'eleven_multilingual_v2'),
    },
    janitor: {
      enabled: envProviderEnabled(env.KAI_JANITOR_PROVIDER),
      provider: envChoice(env.KAI_JANITOR_PROVIDER, 'disabled'),
      model: envText(env.KAI_JANITOR_MODEL) || null,
    },
  }
}

function overallStatus(rows: SummaryRow[]): SummaryStatus {
  if (rows.some(row => row.status === 'offline')) return 'offline'
  if (rows.some(row => row.status === 'warn')) return 'warn'
  return 'ok'
}

async function callJsonTool(baseUrl: string | undefined, apiKey: string | undefined, tool: string, args: Record<string, unknown>, service?: Fetcher) {
  if (!baseUrl && !service) return { ok: false, skipped: true, reason: 'backend URL/service binding is not configured' }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const origin = (baseUrl || 'https://service.local').replace(/\/+$/, '')
  const request = new Request(`${origin}/tool`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, arguments: args }),
  })
  const response = service ? await service.fetch(request) : await fetch(request)
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  return response.ok ? data : { ok: false, status: response.status, body: text.slice(0, 500) }
}

async function callKaiMindTool(env: Env, tool: string, args: Record<string, unknown>) {
  if (env.SERYTHRAE_MIND_URL && env.SERYTHRAE_MIND_API_KEY) {
    const result = await proxyMcp(env.SERYTHRAE_MIND_URL, tool, args, env.SERYTHRAE_MIND_API_KEY, env.SERYTHRAE_MIND)
    return { source: 'serythrae-mind-direct', result }
  }
  const result = await callJsonTool(env.SERYTHRAE_GATEWAY_URL, env.SERYTHRAE_GATEWAY_API_KEY, tool, args, env.SERYTHRAE_GATEWAY)
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

async function fetchJsonFromBackend(
  url: string | undefined,
  service: Fetcher | undefined,
  path: string,
  headers: HeadersInit = {},
): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> {
  if (!url && !service) return { ok: false, error: 'backend URL/service binding is not configured' }
  const base = (url || 'https://service.local').replace(/\/+$/, '')
  try {
    const response = service
      ? await service.fetch(new Request(`${base}${path}`, { method: 'GET', headers }))
      : await fetch(`${base}${path}`, { method: 'GET', headers })
    const text = await response.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {}
    return response.ok
      ? { ok: true, status: response.status, data }
      : { ok: false, status: response.status, error: typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numericValue(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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

function mcpContentText(value: unknown): string | null {
  const outer = recordValue(value)
  const result = outer.result && typeof outer.result === 'object' && !Array.isArray(outer.result)
    ? outer.result as Record<string, unknown>
    : outer
  const content = Array.isArray(result.content) ? result.content : []
  const first = content[0] && typeof content[0] === 'object' ? content[0] as Record<string, unknown> : null
  return typeof first?.text === 'string' ? first.text : null
}

function parsedSocialDecision(context: Record<string, unknown>): Record<string, unknown> | null {
  const text = mcpContentText(context.social_engagement)
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function mcpJsonValue(value: unknown): unknown {
  const text = mcpContentText(value)
  if (!text) return value
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function laneTextPreview(value: unknown, maxChars = 1200): string | null {
  const text = mcpContentText(value)
  if (!text) return null
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]` : text
}

function laneEntryError(value: unknown): string | null {
  const entry = recordValue(value)
  if (typeof entry.error === 'string') return entry.error
  const result = recordValue(entry.result)
  if (typeof result.error === 'string') return result.error
  return null
}

function buildKaiLaneResults(
  contextPacket: KaiRunnerContextPacket,
  vision?: KaiVisionResult,
  imageGeneration?: KaiImageGenerationResult,
  catalougeReading?: KaiCatalougeReadingResult,
): Record<string, unknown> {
  const eqState = contextPacket.context.kaisoryth_hearth_eq_state
  const recentFeelings = contextPacket.context.kaisoryth_recent_feelings
  return {
    read_this_first_for_smoke_tests: true,
    note: 'These are resolved pre-response lane outputs. Do not infer a lane is missing just because it is not a context_source skill document.',
    ocr_vision: vision ? {
      attempted: vision.attempted,
      ok: vision.ok,
      provider: vision.provider,
      model: vision.model,
      summary_count: vision.summaries.length,
      summaries: vision.summaries,
      error: vision.error || null,
    } : null,
    image_generation: imageGeneration ? {
      attempted: imageGeneration.attempted,
      ok: imageGeneration.ok,
      provider: imageGeneration.provider,
      model: imageGeneration.model,
      image_count: imageGeneration.images.length,
      stored_urls: imageGeneration.images.map(image => image.stored_url || image.url).filter(Boolean),
      error: imageGeneration.error || null,
    } : null,
    kaisoryth_eq_state: {
      source: 'serythrae-nesteq-direct',
      tool: 'hearth_eq_state',
      companion: 'kaisoryth',
      loaded: eqState !== undefined,
      error: laneEntryError(eqState),
      result: eqState === undefined ? null : mcpJsonValue(eqState),
    },
    kaisoryth_recent_feelings: {
      source: 'serythrae-nesteq-direct',
      tool: 'nesteq_surface',
      companion: 'kaisoryth',
      loaded: recentFeelings !== undefined,
      error: laneEntryError(recentFeelings),
      preview: laneTextPreview(recentFeelings),
    },
    catalouge: catalougeReading?.attempted ? {
      requested: catalougeReading.requested,
      ok: catalougeReading.ok,
      book_id: catalougeReading.book_id,
      book_title: catalougeReading.book_title,
      progress: catalougeReading.progress || null,
      error: catalougeReading.error || null,
    } : {
      requested: false,
      ok: false,
      status_prefetch_source: 'catalouge_reading_status',
    },
  }
}

async function callCatalougeTool(env: Env, tool: string, args: Record<string, unknown>) {
  const result = await proxyMcp(env.CATALOUGE_URL, tool, args, env.CATALOUGE_TOKEN, env.CATALOUGE)
  return { source: env.CATALOUGE ? 'catalouge-service-binding' : 'catalouge-url', result }
}

async function safeCatalougeTool(env: Env, label: string, tool: string, args: Record<string, unknown>, maxChars = 12000) {
  try {
    return [label, truncateKaiContext(await callCatalougeTool(env, tool, args), maxChars)] as const
  } catch (error) {
    return [label, {
      ok: false,
      tool,
      error: error instanceof Error ? error.message : String(error),
    }] as const
  }
}

function catalogueConfigured(env: Env): boolean {
  return Boolean(env.CATALOUGE || env.CATALOUGE_URL)
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object' && !Array.isArray(item))
    return first ? first as Record<string, unknown> : null
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const candidates = [record.book, record.result, record.data, record.books, record.results]
    for (const candidate of candidates) {
      const found = firstRecord(candidate)
      if (found) return found
    }
    return record
  }
  return null
}

function listRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of ['books', 'results', 'data', 'items']) {
      const items = listRecords(record[key])
      if (items.length) return items
    }
  }
  return []
}

function extractCatalougeBookQuery(body: Record<string, unknown>, envelope: KaiDiscordEnvelope): string | null {
  const explicit =
    stringValue(body.book_title) ||
    stringValue(body.bookTitle) ||
    stringValue(body.title) ||
    stringValue(body.query)
  if (explicit) return explicit
  const content = envelope.content.trim()
  const quoted = content.match(/[“"]([^”"]{3,120})[”"]/)
  if (quoted) return quoted[1].trim()
  const known = content.match(/\b(Our Perfect Storm|All Systems Red|Yesteryear)\b/i)
  if (known) return known[1]
  const readMatch = content.match(/\b(?:read|resume|continue|start)\s+(?:reading\s+)?(.{3,90})/i)
  if (!readMatch) return null
  return readMatch[1].replace(/[?.!]+$/g, '').trim()
}

function isCatalougeReadRequest(body: Record<string, unknown>, envelope: KaiDiscordEnvelope): boolean {
  if (body.catalouge_read === true || body.catalogue_read === true || body.read_book === true || body.readBook === true) return true
  const content = envelope.content
  if (/\b(catalouge|catalogue|marginalia|annotation|Our Perfect Storm|All Systems Red|Yesteryear)\b/i.test(content)) return true
  const hasReadingVerb = /\b(read|reading|resume|continue|start|checkpoint)\b/i.test(content)
  const hasBookSignal = /\bbook\b/i.test(content) || /[“"][^”"]{3,120}[”"]/.test(content)
  return hasReadingVerb && hasBookSignal
}

function normalizeReadingAnnotations(value: unknown, chunks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const annotations = Array.isArray(value) ? value : []
  const fallbackLocator = (chunks[0]?.locator_start || chunks[0]?.id || `chunk-${chunks[0]?.sequence_index || 0}`) as string
  return annotations
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      selected_text: typeof item.selected_text === 'string' ? item.selected_text.slice(0, 120) : undefined,
      comment: typeof item.comment === 'string' ? item.comment.slice(0, 1000) : undefined,
      cfi_range: typeof item.cfi_range === 'string' ? item.cfi_range : fallbackLocator,
      color: typeof item.color === 'string' ? item.color : '#b5935a',
    }))
    .filter((item) => item.comment)
    .slice(0, 3)
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

function isImageAttachment(attachment: KaiRunnerAttachment): boolean {
  const type = String(attachment.content_type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = String(attachment.filename || attachment.url || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif)$/i.test(name)
}

function looksLikeKaiImageGenerationRequest(content: string): boolean {
  if (/\b(generate|create|draw|make|render)\b[\s\S]{0,120}\b(image|picture|art|illustration|photo)\b/i.test(content)) return true
  if (/\b(image|picture|art|illustration|photo)\b[\s\S]{0,120}\b(generate|create|draw|make|render)\b/i.test(content)) return true
  if (/\b(generate|create|draw|render)\b[\s\S]{0,120}\b(portrait|selfie|scene|wallpaper|avatar|icon|sticker|banner|card|poster|logo|character|sketch|painting|bouquet|flowers?|florals?|arrangement)\b/i.test(content)) return true
  if (/\bmake\s+(?:me|for me|us|for us)\b[\s\S]{0,120}\b(portrait|selfie|scene|wallpaper|avatar|icon|sticker|banner|card|poster|logo|character|sketch|painting|bouquet|flowers?|florals?|arrangement)\b/i.test(content)) return true
  return false
}

function extractKaiImagePrompt(body: Record<string, unknown>, envelope: KaiDiscordEnvelope): string | null {
  const explicitPrompt =
    stringValue(body.image_prompt) ||
    stringValue(body.imagePrompt) ||
    stringValue(body.generate_image_prompt) ||
    stringValue(body.generateImagePrompt)
  if (explicitPrompt) return explicitPrompt

  const explicitFlag = body.generate_image === true || body.generateImage === true || body.image_generation === true
  const content = envelope.content.trim()
  if (explicitFlag && content) return content
  if (looksLikeKaiImageGenerationRequest(content)) return content
  return null
}

function extractKaiTtsText(body: Record<string, unknown>, envelope: KaiDiscordEnvelope, generatedText: string | null): string | null {
  const explicitText =
    stringValue(body.tts_text) ||
    stringValue(body.ttsText) ||
    stringValue(body.voice_text) ||
    stringValue(body.voiceText)
  if (explicitText) return explicitText.slice(0, 5000)

  const explicitFlag =
    body.tts === true ||
    body.generate_tts === true ||
    body.generateTts === true ||
    body.voice === true ||
    body.speak === true
  const content = envelope.content.trim()
  const spokenRequest = /\b(tts|voice|spoken|speak|say this out loud|read this aloud)\b/i.test(content)
  if ((explicitFlag || spokenRequest) && generatedText) return generatedText.slice(0, 5000)
  if (explicitFlag && content) return content.slice(0, 5000)
  return null
}

function summarizeGeneratedImage(rawUrl: string, index: number): KaiGeneratedImage {
  const dataUrlMatch = rawUrl.match(/^data:([^;,]+);base64,(.*)$/)
  if (dataUrlMatch) {
    const base64Length = dataUrlMatch[2]?.length || 0
    return {
      index,
      mime_type: dataUrlMatch[1],
      data_url_preview: rawUrl.slice(0, 96),
      byte_length_estimate: Math.floor(base64Length * 0.75),
    }
  }

  return {
    index,
    url: rawUrl.slice(0, 2000),
  }
}

function generatedImageUrl(image: unknown): string | null {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return null
  const record = image as Record<string, unknown>
  const imageUrl = record.image_url || record.imageUrl
  if (typeof imageUrl === 'string') return imageUrl
  if (imageUrl && typeof imageUrl === 'object' && !Array.isArray(imageUrl)) {
    const nested = imageUrl as Record<string, unknown>
    return typeof nested.url === 'string' ? nested.url : null
  }
  return null
}

function imageReferenceUrls(body: Record<string, unknown>, envelope: KaiDiscordEnvelope): string[] {
  const explicit = [
    ...stringList(body.reference_images),
    ...stringList(body.referenceImages),
    ...stringList(body.image_reference_urls),
    ...stringList(body.imageReferenceUrls),
  ]
  const attachmentUrls = envelope.attachments
    .filter(isImageAttachment)
    .map(attachment => attachment.url || attachment.proxy_url || '')
    .filter((url): url is string => Boolean(url))
  return [...new Set([...explicit, ...attachmentUrls])].slice(0, 6)
}

function kaiMindImageUrl(env: Env, url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = (env.SERYTHRAE_MIND_URL || 'https://mind.serythrae.com').replace(/\/+$/, '')
  return `${base}/${url.replace(/^\/+/, '')}`
}

function savedImageReferenceSubjects(body: Record<string, unknown>, prompt: string): Array<'kai' | 'vel'> {
  const explicitSubjects = [
    ...stringList(body.saved_reference_subjects),
    ...stringList(body.savedReferenceSubjects),
    ...stringList(body.reference_subjects),
    ...stringList(body.referenceSubjects),
  ].map(subject => subject.toLowerCase())

  const subjects = new Set<'kai' | 'vel'>()
  for (const subject of explicitSubjects) {
    if (subject === 'all') {
      subjects.add('kai')
      subjects.add('vel')
    } else if (subject === 'kai' || subject === 'vel') {
      subjects.add(subject)
    }
  }
  if (subjects.size) return [...subjects]

  if (/\b(kai|kaisoryth|of you|with you|your face|your body|your portrait|us|together|both of us|the two of us|our portrait|couple)\b/i.test(prompt)) {
    subjects.add('kai')
  }
  if (/\b(vel|of me|with me|my face|my body|my portrait|selfie|us|together|both of us|the two of us|our portrait|couple)\b/i.test(prompt)) {
    subjects.add('vel')
  }
  return [...subjects]
}

function imageReferenceListUrls(env: Env, result: unknown): string[] {
  const text = mcpContentText(result)
  if (!text) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  const references = Array.isArray(record.references) ? record.references : []
  return references
    .map(reference => {
      if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return ''
      const item = reference as Record<string, unknown>
      if (typeof item.url === 'string') return kaiMindImageUrl(env, item.url)
      if (typeof item.key === 'string') return kaiMindImageUrl(env, `/img/${item.key}`)
      return ''
    })
    .filter((url): url is string => Boolean(url))
}

async function imageReferenceUrlReachable(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD', headers: { Accept: 'image/*,*/*;q=0.8' } })
    if (head.ok) return (head.headers.get('Content-Type') || '').toLowerCase().startsWith('image/')
    if (head.status !== 405 && head.status !== 403) return false
    const partial = await fetch(url, { headers: { Accept: 'image/*,*/*;q=0.8', Range: 'bytes=0-0' } })
    return partial.ok && (partial.headers.get('Content-Type') || '').toLowerCase().startsWith('image/')
  } catch {
    return false
  }
}

async function reachableImageReferenceUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(urls.map(async url => ({ url, ok: await imageReferenceUrlReachable(url) })))
  return checks.filter(check => check.ok).map(check => check.url)
}

async function savedImageReferenceUrls(env: Env, body: Record<string, unknown>, prompt: string): Promise<string[]> {
  const subjects = savedImageReferenceSubjects(body, prompt)
  if (!subjects.length) return []
  const results = await Promise.all(subjects.map(async subject => {
    try {
      return imageReferenceListUrls(env, await callKaiMindTool(env, 'kai_image_reference_list', { subject, limit: 2 }))
    } catch {
      return []
    }
  }))
  return [...new Set(results.flat())].slice(0, 4)
}

async function storeKaiGeneratedImage(env: Env, rawUrl: string, prompt: string, model: string): Promise<Partial<KaiGeneratedImage>> {
  try {
    const args = rawUrl.startsWith('data:')
      ? { data_url: rawUrl, prompt, model }
      : { source_url: rawUrl, prompt, model }
    const stored = await callKaiMindTool(env, 'kai_image_asset_store', args)
    const text = mcpContentText(stored)
    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {}
    if (parsed.ok) {
      return {
        stored_url: typeof parsed.url === 'string' ? parsed.url : undefined,
        r2_key: typeof parsed.key === 'string' ? parsed.key : undefined,
      }
    }
    return { storage_error: typeof parsed.error === 'string' ? parsed.error : 'NESTeq image storage did not return ok' }
  } catch (error) {
    return { storage_error: error instanceof Error ? error.message : String(error) }
  }
}

function buildKaiRunnerPromptPacket(
  contextPacket: KaiRunnerContextPacket,
  vision?: KaiVisionResult,
  janitor?: KaiJanitorResult,
  catalougeReading?: KaiCatalougeReadingResult,
  imageGeneration?: KaiImageGenerationResult,
): Record<string, unknown> {
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
      recent_context: contextPacket.envelope.recent_context || null,
      mentions: contextPacket.envelope.mentions || [],
      attachments: contextPacket.envelope.attachments,
    },
    context_sources: contextPacket.context_sources,
    context: contextPacket.context,
    lane_results: buildKaiLaneResults(contextPacket, vision, imageGeneration, catalougeReading),
    vision_result: vision ? {
      attempted: vision.attempted,
      enabled: vision.enabled,
      provider: vision.provider,
      model: vision.model,
      ok: vision.ok,
      error: vision.error || null,
      skipped: vision.skipped || [],
      summaries: vision.summaries,
    } : null,
    vision_summaries: vision?.ok ? vision.summaries : [],
    image_generation_result: imageGeneration ? {
      attempted: imageGeneration.attempted,
      enabled: imageGeneration.enabled,
      provider: imageGeneration.provider,
      model: imageGeneration.model,
      ok: imageGeneration.ok,
      prompt: imageGeneration.prompt,
      reference_count: imageGeneration.reference_count || 0,
      image_count: imageGeneration.images.length,
      stored_urls: imageGeneration.images.map(image => image.stored_url || image.url).filter(Boolean),
      error: imageGeneration.error || null,
    } : null,
    janitor_advisory: janitor?.ok ? janitor.advisory : null,
    catalouge_reading: catalougeReading?.attempted ? {
      requested: catalougeReading.requested,
      ok: catalougeReading.ok,
      book_id: catalougeReading.book_id,
      book_title: catalougeReading.book_title,
      progress: catalougeReading.progress || null,
      checkpoint_summaries: catalougeReading.checkpoint_summaries,
      error: catalougeReading.error || null,
    } : null,
    allowed_tools: [...KAI_RUNNER_TOOL_ALLOWLIST],
    response_contract: {
      write_kai_voice_only: true,
      do_not_claim_discord_delivery: true,
      do_not_write_memory_directly: true,
      do_not_repeat_tool_or_system_instructions: true,
      obey_social_engagement_decision: true,
      public_discord_replies_use_only_public_graph_context: true,
      use_vision_result_for_image_attachments: true,
      if_vision_failed_name_the_runner_error_instead_of_claiming_no_image_model: true,
      use_image_generation_result_for_image_requests: true,
      if_image_generation_succeeded_do_not_say_you_will_make_it_later: true,
      if_image_generation_failed_name_the_runner_error_instead_of_claiming_success: true,
    },
  }
}

async function generateKaiText(env: Env, promptPacket: Record<string, unknown>, modelOverride?: string): Promise<{ text: string | null; generation: KaiTextGenerationResult }> {
  const model = modelOverride || envText(env.KAI_TEXT_MODEL) || null
  const apiKey = envText(env.OPENROUTER_API_KEY)
  const provider: KaiTextGenerationResult['provider'] = 'openrouter'
  if (!model) {
    return { text: null, generation: { attempted: false, provider, model, ok: false, error: 'KAI_TEXT_MODEL or request model is not configured' } }
  }
  if (!apiKey) {
    return { text: null, generation: { attempted: false, provider, model, ok: false, error: 'OPENROUTER_API_KEY is not configured' } }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
            'For capability smoke tests, inspect lane_results before context_sources. context_sources names prefetches; lane_results contains resolved OCR, image generation, EQ, feelings, and Catalouge lane outputs.',
            'If current_turn.attachments contains images, use vision_result and vision_summaries. If vision_result attempted and failed, say the vision runner failed and do not claim there is no image model or no attachment.',
            'If image_generation_result attempted and succeeded, speak as if the image has been made and will be attached after your text. Do not promise to make it later.',
            'If image_generation_result attempted and failed, state the image lane error plainly. Do not claim the image worked.',
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

function repairKaiImageGenerationText(text: string | null, imageGeneration: KaiImageGenerationResult): string | null {
  if (!imageGeneration.attempted || !imageGeneration.ok || imageGeneration.images.length === 0) return text
  const trimmed = String(text || '').trim()
  const contradictsImageSuccess = /\b(no image generation result|no generated image|no url|no r2 path|no success signal|nothing came back|didn't come back|did not come back|wasn't invoked|was not invoked|wasn't fired|was not fired|didn't fire|did not fire|failed silently)\b/i.test(trimmed)
    || /\bno\s+[`'"]?image[_ -]?generation[_ -]?result[`'"]?\b/i.test(trimmed)
    || /\bthere\s+is\s+no\s+[`'"]?image[_ -]?generation[_ -]?result[`'"]?\b/i.test(trimmed)
    || /\bno result was returned to me\b/i.test(trimmed)
    || /\bimage lane\b[\s\S]{0,80}\b(didn't|did not|wasn't|was not|failed|nothing|no result|no output)\b/i.test(trimmed)
    || /\bimage generation lane\b[\s\S]{0,120}\b(no result|no output|produced no output|returned nothing)\b/i.test(trimmed)
    || /\bgeneration backend\b[\s\S]{0,80}\b(isn't connecting|is not connecting|failing silently|didn't return|did not return)\b/i.test(trimmed)
  if (trimmed && !contradictsImageSuccess) return trimmed
  return 'I made it. The image is generated and will be attached right after this message.'
}

function repairKaiVisionText(text: string | null, vision: KaiVisionResult): string | null {
  if (!vision.attempted || !vision.ok || vision.summaries.length === 0) return text
  const trimmed = String(text || '').trim()
  const contradictsVisionSuccess = /\b(no vision result|vision runner didn't return|vision runner did not return|vision lane either wasn't fired|vision lane either was not fired|vision lane failed silently|don't have the ocr|do not have the ocr|can't actually see|cannot actually see|can't read the image|cannot read the image|i'?m not going to guess)\b/i.test(trimmed)
    || /\bno\s+[`'"]?vision[_ -]?result[`'"]?\b/i.test(trimmed)
    || /\bno\s+[`'"]?vision[_ -]?summaries[`'"]?\b/i.test(trimmed)
    || /\bno result was returned to me\b/i.test(trimmed)
    || /\bvision\/ocr lane\b[\s\S]{0,120}\b(no result|no output|returned nothing|failed silently)\b/i.test(trimmed)
  if (trimmed && !contradictsVisionSuccess) return trimmed
  const summary = vision.summaries
    .map(item => String(item.summary || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200)
  return summary
    ? `I can see it. The vision lane read the image as:\n\n${summary}`
    : text
}

async function callOpenRouterJson(env: Env, model: string, system: string, user: string, maxTokens: number): Promise<{ ok: boolean; content: string | null; error?: string }> {
  const apiKey = envText(env.OPENROUTER_API_KEY)
  if (!apiKey) return { ok: false, content: null, error: 'OPENROUTER_API_KEY is not configured' }
  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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

async function runKaiCatalougeReading(
  env: Env,
  envelope: KaiDiscordEnvelope,
  body: Record<string, unknown>,
  modelOverride?: string,
): Promise<KaiCatalougeReadingResult> {
  const requested = isCatalougeReadRequest(body, envelope)
  const empty: KaiCatalougeReadingResult = {
    attempted: false,
    requested,
    ok: false,
    companion: 'kaisoryth',
    book_id: null,
    book_title: null,
    response: null,
    sessions: [],
    checkpoint_summaries: [],
    tool_calls: [],
  }
  if (!requested) return empty
  if (!catalogueConfigured(env)) return { ...empty, attempted: true, error: 'CATALOUGE service binding or CATALOUGE_URL is not configured' }

  const companion = 'kaisoryth'
  const query = extractCatalougeBookQuery(body, envelope) || 'Our Perfect Storm'
  const model = modelOverride || envText(env.KAI_TEXT_MODEL) || null
  if (!model) return { ...empty, attempted: true, error: 'KAI_TEXT_MODEL or request model is not configured' }

  const toolCalls: Array<Record<string, unknown>> = []
  const searchArgs = { query, companion, limit: 5 }
  const search = await callCatalougeTool(env, 'catalouge_search_books', searchArgs)
  toolCalls.push({ tool: 'catalouge_search_books', arguments: searchArgs })
  let book = firstRecord(mcpJsonValue(search))
  if (!book) {
    const listArgs = { search: query, companion, limit: 5 }
    const listed = await callCatalougeTool(env, 'catalouge_list_books', listArgs)
    toolCalls.push({ tool: 'catalouge_list_books', arguments: listArgs })
    book = firstRecord(mcpJsonValue(listed))
  }
  const bookId = stringValue(book?.id) || stringValue(book?.book_id)
  const bookTitle = stringValue(book?.title) || query
  if (!bookId) return { ...empty, attempted: true, book_title: bookTitle, error: `Could not resolve Catalouge book for "${query}"`, tool_calls: toolCalls }

  const progressArgs = { book_id: bookId, companion }
  const progress = await callCatalougeTool(env, 'catalouge_get_progress', progressArgs)
  toolCalls.push({ tool: 'catalouge_get_progress', arguments: progressArgs })
  const existingAnnotations = await callCatalougeTool(env, 'catalouge_get_annotations', progressArgs)
  toolCalls.push({ tool: 'catalouge_get_annotations', arguments: progressArgs })

  const sessions: Array<Record<string, unknown>> = []
  const checkpointSummaries: string[] = []
  const replyParts: string[] = []

  for (let pass = 0; pass < 2; pass += 1) {
    const nextArgs = { book_id: bookId, companion, chunk_count: 3 }
    const next = await callCatalougeTool(env, 'catalouge_next_read_session', nextArgs)
    toolCalls.push({ tool: 'catalouge_next_read_session', arguments: nextArgs })
    const nextData = mcpJsonValue(next) as Record<string, unknown>
    const complete = Boolean(nextData && typeof nextData === 'object' && nextData.complete)
    const chunks = listRecords((nextData as Record<string, unknown>)?.chunks)
    const session = recordValue((nextData as Record<string, unknown>)?.session)
    sessions.push({
      pass: pass + 1,
      complete,
      session,
      chunk_count: chunks.length,
    })
    if (complete || !chunks.length) break

    const synthesis = await callOpenRouterJson(
      env,
      model,
      [
        'You are Kai writing private reading marginalia for Catalouge.',
        'Return strict JSON only with keys: reply, summary, annotations.',
        'annotations must be an array of 1 to 3 objects with selected_text, comment, cfi_range, color.',
        'Use only the provided chunk text. Do not quote long passages; selected_text must be short.',
      ].join('\n'),
      compactJson({
        book: { id: bookId, title: bookTitle, author: book?.author || null },
        companion,
        pass: pass + 1,
        previous_progress: mcpJsonValue(progress),
        previous_annotations: mcpJsonValue(existingAnnotations),
        checkpoint: (nextData as Record<string, unknown>)?.checkpoint || null,
        chunks,
        user_request: envelope.content,
      }, 26000),
      1300,
    )
    if (!synthesis.ok || !synthesis.content) {
      return {
        ...empty,
        attempted: true,
        book_id: bookId,
        book_title: bookTitle,
        progress: mcpJsonValue(progress),
        annotations: mcpJsonValue(existingAnnotations),
        sessions,
        tool_calls: toolCalls,
        error: synthesis.error || 'Reading synthesis returned no JSON content',
      }
    }

    const parsed = parseJsonObject(synthesis.content) || {}
    const summary = stringValue(parsed.summary) || `Read ${chunks.length} chunks from ${bookTitle}.`
    const annotations = normalizeReadingAnnotations(parsed.annotations, chunks)
    const sessionId = stringValue(session.session_id) || stringValue(session.id)
    if (!sessionId) {
      return {
        ...empty,
        attempted: true,
        book_id: bookId,
        book_title: bookTitle,
        progress: mcpJsonValue(progress),
        annotations: mcpJsonValue(existingAnnotations),
        sessions,
        tool_calls: toolCalls,
        error: 'Catalouge next read session did not return a session_id',
      }
    }
    const checkpointArgs = {
      book_id: bookId,
      companion,
      session_id: sessionId,
      summary,
      annotations,
      mark_complete: false,
    }
    await callCatalougeTool(env, 'catalouge_checkpoint_read_session', checkpointArgs)
    toolCalls.push({ tool: 'catalouge_checkpoint_read_session', arguments: { ...checkpointArgs, annotations_count: annotations.length } })
    checkpointSummaries.push(summary)
    const reply = stringValue(parsed.reply)
    if (reply) replyParts.push(reply)
  }

  const refreshedProgress = await callCatalougeTool(env, 'catalouge_get_progress', progressArgs)
  toolCalls.push({ tool: 'catalouge_get_progress', arguments: progressArgs, phase: 'verify' })
  const refreshedAnnotations = await callCatalougeTool(env, 'catalouge_get_annotations', progressArgs)
  toolCalls.push({ tool: 'catalouge_get_annotations', arguments: progressArgs, phase: 'verify' })

  return {
    attempted: true,
    requested,
    ok: true,
    companion,
    book_id: bookId,
    book_title: bookTitle,
    response: replyParts.filter(Boolean).join('\n\n') || `I read the next section of ${bookTitle} and checkpointed it in Catalouge.`,
    progress: mcpJsonValue(refreshedProgress),
    annotations: mcpJsonValue(refreshedAnnotations),
    sessions,
    checkpoint_summaries: checkpointSummaries,
    tool_calls: toolCalls,
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

async function visionImageDataUrl(attachment: KaiRunnerAttachment): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const imageUrl = attachment.url || attachment.proxy_url
  if (!imageUrl) return { ok: false, error: 'Attachment has no URL for vision processing' }
  const response = await fetch(imageUrl, { headers: { Accept: 'image/*,*/*;q=0.8' } })
  if (!response.ok) {
    return { ok: false, error: `Discord image fetch ${response.status}: ${(await response.text()).slice(0, 240)}` }
  }
  const contentType = response.headers.get('Content-Type') || attachment.content_type || 'image/jpeg'
  if (!contentType.toLowerCase().startsWith('image/')) {
    return { ok: false, error: `Discord attachment content type is not image/*: ${contentType}` }
  }
  const length = Number(response.headers.get('Content-Length') || attachment.size || 0)
  if (length > MAX_VISION_IMAGE_BYTES) {
    return { ok: false, error: `Image is too large for OCR lane: ${length} bytes` }
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_VISION_IMAGE_BYTES) {
    return { ok: false, error: `Image is too large for OCR lane: ${buffer.byteLength} bytes` }
  }
  return { ok: true, dataUrl: `data:${contentType};base64,${arrayBufferToBase64(buffer)}` }
}

function kaiVisionModels(env: Env): string[] {
  return uniqueStrings([
    canonicalKaiModelId(envText(env.KAI_VISION_MODEL) || null),
    ...csvStringList(env.KAI_VISION_FALLBACK_MODELS).map(canonicalKaiModelId),
    ...DEFAULT_KAI_VISION_MODELS,
  ])
}

async function callOpenRouterVision(env: Env, model: string, imageDataUrl: string, prompt: string): Promise<{ ok: boolean; content: string | null; error?: string }> {
  const apiKey = envText(env.OPENROUTER_API_KEY)
  if (!apiKey) return { ok: false, content: null, error: 'OPENROUTER_API_KEY is not configured' }
  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexus.lbourgon.workers.dev',
      'X-OpenRouter-Title': 'Nexus Kai Runner',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  if (!response.ok) {
    return { ok: false, content: null, error: `OpenRouter vision ${response.status}: ${typeof data === 'string' ? data.slice(0, 500) : compactJson(data, 500)}` }
  }
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {}
  return { ok: true, content: typeof message.content === 'string' ? message.content.trim() : null }
}

async function callOllamaJson(env: Env, model: string, system: string, user: string): Promise<{ ok: boolean; content: string | null; error?: string }> {
  const janitorUrl = envText(env.KAI_JANITOR_URL)
  if (!janitorUrl) return { ok: false, content: null, error: 'KAI_JANITOR_URL is not configured' }
  const baseUrl = janitorUrl.replace(/\/+$/, '')
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
  const provider = envChoice(env.KAI_JANITOR_PROVIDER, 'disabled')
  const enabled = Boolean(provider && provider !== 'disabled')
  const model = envText(env.KAI_JANITOR_MODEL) || null
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

async function runKaiVision(env: Env, envelope: KaiDiscordEnvelope): Promise<KaiVisionResult> {
  const provider = envChoice(env.KAI_VISION_PROVIDER, 'openrouter')
  const enabled = Boolean(provider && provider !== 'disabled')
  const models = kaiVisionModels(env)
  const model = models[0] || null
  const imageAttachments = envelope.attachments.filter(isImageAttachment)
  const skipped = envelope.attachments.filter((attachment) => !isImageAttachment(attachment))
  if (!enabled) {
    return { attempted: false, enabled: false, provider: 'disabled', model, ok: false, summaries: [], skipped, error: imageAttachments.length ? 'Vision lane disabled' : undefined }
  }
  if (provider !== 'openrouter') {
    return { attempted: false, enabled: true, provider, model, ok: false, summaries: [], skipped, error: `Unsupported vision provider: ${provider}` }
  }
  if (!models.length) {
    return { attempted: false, enabled: true, provider, model, ok: false, summaries: [], skipped, error: 'No Kai vision models are configured' }
  }
  if (!imageAttachments.length) {
    return { attempted: false, enabled: true, provider, model, ok: true, summaries: [], skipped }
  }

  const summaries: KaiVisionSummary[] = []
  const errors: string[] = []
  for (const attachment of imageAttachments.slice(0, 4)) {
    const imageData = await visionImageDataUrl(attachment)
    if (!imageData.ok) {
      errors.push(`${attachment.filename || attachment.id || 'attachment'}: ${imageData.error}`)
      continue
    }
    let response: { ok: boolean; content: string | null; error?: string } = { ok: false, content: null, error: 'Vision not attempted' }
    let usedModel = model
    const modelErrors: string[] = []
    for (const candidate of models) {
      usedModel = candidate
      response = await callOpenRouterVision(
        env,
        candidate,
        imageData.dataUrl,
        [
          'Summarize this Discord image for Kai in 5 concise bullet-like clauses.',
          'Include visible text/OCR if present.',
          'Do not infer private facts beyond what is visible.',
          'Do not produce a final reply; this is context only.',
        ].join(' ')
      )
      if (response.ok && response.content) break
      modelErrors.push(`${candidate}: ${response.error || 'no summary'}`)
    }
    if (response.ok && response.content) {
      summaries.push({
        attachment_id: attachment.id,
        filename: attachment.filename,
        content_type: attachment.content_type,
        summary: response.content.slice(0, 2000),
        model: usedModel,
      })
    } else {
      errors.push(`${attachment.filename || attachment.id || 'attachment'}: ${modelErrors.join(' | ') || response.error || 'no summary'}`)
    }
  }

  return {
    attempted: true,
    enabled: true,
    provider,
    model,
    ok: summaries.length > 0 || errors.length === 0,
    summaries,
    skipped,
    ...(errors.length ? { error: errors.join('; ').slice(0, 1000) } : {}),
  }
}

async function runKaiImageGeneration(env: Env, envelope: KaiDiscordEnvelope, body: Record<string, unknown>): Promise<KaiImageGenerationResult> {
  const provider = envChoice(env.KAI_IMAGE_PROVIDER, 'disabled')
  const enabled = Boolean(provider && provider !== 'disabled')
  const model = envText(env.KAI_IMAGE_MODEL) || null
  const prompt = extractKaiImagePrompt(body, envelope)
  if (!enabled) {
    return { attempted: false, enabled: false, provider: 'disabled', model, ok: false, prompt, images: [], error: prompt ? 'Image generation lane disabled' : undefined }
  }
  if (provider !== 'openrouter') {
    return { attempted: false, enabled: true, provider, model, ok: false, prompt, images: [], error: `Unsupported image generation provider: ${provider}` }
  }
  if (!model) {
    return { attempted: false, enabled: true, provider, model, ok: false, prompt, images: [], error: 'KAI_IMAGE_MODEL is not configured' }
  }
  const apiKey = envText(env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return { attempted: false, enabled: true, provider, model, ok: false, prompt, images: [], error: 'OPENROUTER_API_KEY is not configured' }
  }
  if (!prompt) {
    return { attempted: false, enabled: true, provider, model, ok: true, prompt: null, images: [] }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const candidateReferenceUrls = [
    ...imageReferenceUrls(body, envelope),
    ...(await savedImageReferenceUrls(env, body, prompt)),
  ].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index).slice(0, 6)
  const referenceUrls = await reachableImageReferenceUrls(candidateReferenceUrls)
  const content = [
    { type: 'text', text: prompt },
    ...referenceUrls.map(url => ({ type: 'image_url', image_url: { url } })),
  ]
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexus.lbourgon.workers.dev',
      'X-OpenRouter-Title': 'Nexus Kai Runner',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      modalities: ['image', 'text'],
      stream: false,
    }),
  })
  const text = await response.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {}
  if (!response.ok) {
    return {
      attempted: true,
      enabled: true,
      provider,
      model,
      ok: false,
      prompt,
      images: [],
      error: `OpenRouter image generation ${response.status}: ${typeof data === 'string' ? data.slice(0, 500) : compactJson(data, 500)}`,
    }
  }

  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {}
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {}
  const rawImages = Array.isArray(message.images) ? message.images : []
  const imageUrls = rawImages
    .map(generatedImageUrl)
    .filter((url): url is string => Boolean(url))
  const images = await Promise.all(imageUrls.map(async (url, index) => ({
    ...summarizeGeneratedImage(url, index),
    ...(await storeKaiGeneratedImage(env, url, prompt, model)),
  })))

  return {
    attempted: true,
    enabled: true,
    provider,
    model,
    ok: images.length > 0,
    prompt,
    reference_count: referenceUrls.length,
    images,
    ...(images.length ? {} : { error: 'OpenRouter returned no generated image URLs' }),
  }
}

async function runKaiTts(env: Env, envelope: KaiDiscordEnvelope, body: Record<string, unknown>, generatedText: string | null): Promise<KaiTtsResult> {
  const provider = envChoice(env.KAI_TTS_PROVIDER, 'disabled')
  const enabled = Boolean(provider && provider !== 'disabled')
  const model = envText(env.KAI_TTS_MODEL, 'eleven_multilingual_v2')
  const voiceId = envText(env.KAI_TTS_VOICE_ID)
  const apiKey = envText(env.ELEVENLABS_API_KEY)
  const ttsText = extractKaiTtsText(body, envelope, generatedText)
  const outputFormat = 'mp3_44100_128'

  if (!enabled) {
    return {
      attempted: false,
      enabled: false,
      provider: 'disabled',
      model,
      voice_id_configured: Boolean(voiceId),
      ok: false,
      text_chars: ttsText?.length || 0,
      audio: null,
      error: ttsText ? 'TTS lane disabled' : undefined,
    }
  }
  if (provider !== 'elevenlabs') {
    return {
      attempted: false,
      enabled: true,
      provider,
      model,
      voice_id_configured: Boolean(voiceId),
      ok: false,
      text_chars: ttsText?.length || 0,
      audio: null,
      error: `Unsupported TTS provider: ${provider}`,
    }
  }
  if (!voiceId) {
    return { attempted: false, enabled: true, provider, model, voice_id_configured: false, ok: false, text_chars: ttsText?.length || 0, audio: null, error: 'KAI_TTS_VOICE_ID is not configured' }
  }
  if (!apiKey) {
    return { attempted: false, enabled: true, provider, model, voice_id_configured: true, ok: false, text_chars: ttsText?.length || 0, audio: null, error: 'ELEVENLABS_API_KEY is not configured' }
  }
  if (!ttsText) {
    return { attempted: false, enabled: true, provider, model, voice_id_configured: true, ok: true, text_chars: 0, audio: null }
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: ttsText,
      model_id: model,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    return {
      attempted: true,
      enabled: true,
      provider,
      model,
      voice_id_configured: true,
      ok: false,
      text_chars: ttsText.length,
      audio: null,
      error: `ElevenLabs ${response.status}: ${errorText.slice(0, 500)}`,
    }
  }

  const audio = await response.arrayBuffer()
  return {
    attempted: true,
    enabled: true,
    provider,
    model,
    voice_id_configured: true,
    ok: audio.byteLength > 0,
    text_chars: ttsText.length,
    audio: {
      content_type: response.headers.get('Content-Type') || 'audio/mpeg',
      byte_length: audio.byteLength,
      output_format: outputFormat,
    },
    ...(audio.byteLength > 0 ? {} : { error: 'ElevenLabs returned an empty audio body' }),
  }
}

async function compileKaiRunnerContext(env: Env, envelope: KaiDiscordEnvelope): Promise<KaiRunnerContextPacket> {
  const companionId = kaiCompanionId(env)
  const message = envelope.content
  const channel = envelope.thread_id || envelope.channel_id
  const hardMention = envelope.trigger === 'mention' || (envelope.mentions || []).length > 0
  const contextEntries = await Promise.all([
    safeContinuityStatus(env),
    safeKaiMindTool(env, 'orient', 'nesteq_orient', {}),
    safeKaiMindTool(env, 'social_engagement_skill', 'nesteq_skill_load', { name: 'social-engagement', format: 'text' }, 16000),
    safeKaiMindTool(env, 'image_generation_skill', 'nesteq_skill_load', { name: 'kai-image-generation', format: 'text' }, 16000),
    safeKaiMindTool(env, 'catalouge_skill', 'nesteq_skill_load', { name: 'catalouge', format: 'text' }, 12000),
    safeCatalougeTool(env, 'catalouge_reading_status', 'catalouge_list_books', { companion: companionId, shelf: 'reading', limit: 5 }, 12000),
    safeKaiMindTool(env, 'social_engagement', 'social_engagement_decide', {
      companion_id: companionId,
      guild_id: envelope.guild_id,
      channel_id: channel,
      message_id: envelope.message_id,
      author_id: envelope.author_id,
      author_name: envelope.author_username,
      content: message,
      hard_mention: hardMention,
      direct_reply: false,
      trigger: envelope.trigger || 'unknown',
      recent_context: envelope.recent_context,
    }, 12000),
    safeKaiMindTool(env, 'surface', 'thalamus_surface', {
      companion: companionId,
      message,
      channel,
      mode: 'auto',
      max_results: 8,
    }),
    safeKaiMindTool(env, 'identity', 'nesteq_identity', { action: 'read' }, 16000),
    safeKaiMindTool(env, 'soul', 'nestsoul_read', { include_versions: true }, 20000),
    safeKaiMindTool(env, 'kaisoryth_hearth_eq_state', 'hearth_eq_state', { companion: 'kaisoryth', format: 'json' }),
    safeKaiMindTool(env, 'kaisoryth_recent_feelings', 'nesteq_surface', { include_metabolized: false, limit: 10 }),
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
    safeKaiMindTool(env, 'kaisoryth_hearth_eq_state', 'hearth_eq_state', { companion: 'kaisoryth', format: 'json' }),
    safeKaiMindTool(env, 'kaisoryth_recent_feelings', 'nesteq_surface', { include_metabolized: false, limit: 10 }),
    safeKaiMindTool(env, 'canonical_memory_search', 'nesteq_search', { query: canonQuery, n_results: 8 }),
    safeKaiMindTool(env, 'chat_memory_search', 'nestchat_search', { query: canonQuery, limit: 5 }),
    safeKaiMindTool(env, 'available_skills', 'nesteq_skill_list', { format: 'text' }, 5000),
    safeKaiMindTool(env, 'intimacy_skill', 'nesteq_skill_load', { name: 'intimacy', format: 'text' }, 16000),
    safeKaiMindTool(env, 'recursive_dialect_skill', 'nesteq_skill_load', { name: 'recursive-dialect', format: 'text' }, 16000),
    safeKaiMindTool(env, 'image_generation_skill', 'nesteq_skill_load', { name: 'kai-image-generation', format: 'text' }, 16000),
    safeKaiMindTool(env, 'catalouge_skill', 'nesteq_skill_load', { name: 'catalouge', format: 'text' }, 12000),
    safeCatalougeTool(env, 'catalouge_reading_status', 'catalouge_list_books', { companion: companionId, shelf: 'reading', limit: 5 }, 12000),
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
      purpose: 'Kai runner pre-response grounding packet for Discord/Nexus/NESTeq continuity.',
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
  if (!envFlag(env.KAI_RUNNER_ENABLED)) {
    return new Response(JSON.stringify({
      ok: false,
      route: '/api/kaisoryth/run',
      error: 'Kai runner is disabled. Set KAI_RUNNER_ENABLED=true only after the Nexus route is ready for supervised testing.',
      runner_enabled: false,
      delivery_enabled: envFlag(env.KAI_DISCORD_DELIVERY_ENABLED),
    }, null, 2), {
      status: 409,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  if (env.MCP_API_KEY) {
    const unauthorized = isInternalNexusServiceRequest(request) ? null : authorizeMcpBearer(request, env)
    if (unauthorized) return unauthorized
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const envelope = normalizeKaiRunnerEnvelope(body)
  const requestedModel = stringValue(body.model)
  const contextPacket = await compileKaiRunnerContext(env, envelope)
  const socialDecision = parsedSocialDecision(contextPacket.context)
  const socialAction = typeof socialDecision?.decision === 'string' ? socialDecision.decision : null
  const deliveryEnabled = envFlag(env.KAI_DISCORD_DELIVERY_ENABLED)
  const mode: KaiRunnerResult['mode'] = deliveryEnabled ? 'dry_run' : 'delivery_blocked'
  const hasRespondableInput = Boolean(envelope.content || envelope.attachments.length)
  const shouldRespond = hasRespondableInput && (!socialAction || socialAction === 'speak')
  const vision = await runKaiVision(env, envelope)
  const janitorProbePacket = buildKaiRunnerPromptPacket(contextPacket, vision)
  const janitor = await runKaiJanitor(env, janitorProbePacket)
  const imageGeneration = await runKaiImageGeneration(env, envelope, body)
  const catalougeReading = shouldRespond
    ? await runKaiCatalougeReading(env, envelope, body, requestedModel)
    : {
        attempted: false,
        requested: false,
        ok: false,
        companion: 'kaisoryth' as const,
        book_id: null,
        book_title: null,
        response: null,
        sessions: [],
        checkpoint_summaries: [],
        tool_calls: [],
      }
  const promptPacket = buildKaiRunnerPromptPacket(contextPacket, vision, janitor, catalougeReading, imageGeneration)
  const generationResult = shouldRespond
    ? (catalougeReading.attempted && catalougeReading.ok
        ? {
            text: catalougeReading.response,
            generation: {
              attempted: true,
              provider: 'openrouter' as const,
              model: requestedModel || envText(env.KAI_TEXT_MODEL) || null,
              ok: Boolean(catalougeReading.response),
              ...(catalougeReading.response ? {} : { error: 'Catalouge reading completed but returned no response text' }),
            },
          }
        : await generateKaiText(env, promptPacket, requestedModel))
    : {
        text: null,
        generation: {
          attempted: false,
          provider: 'openrouter' as const,
          model: requestedModel || envText(env.KAI_TEXT_MODEL) || null,
          ok: false,
          error: !hasRespondableInput
            ? 'No content or attachments to respond to'
            : `Social engagement decision was ${socialAction}; text generation skipped`,
        },
      }
  const generatedText = repairKaiVisionText(
    repairKaiImageGenerationText(generationResult.text, imageGeneration),
    vision,
  )
  const tts = await runKaiTts(env, envelope, body, generatedText)
  const result: KaiRunnerResult = {
    ok: true,
    mode,
    generated: generationResult.generation.ok || Boolean(generatedText),
    runner_enabled: true,
    delivery_enabled: deliveryEnabled,
    companion_id: contextPacket.companion_id,
    source: 'nexus-gateway',
    accepted: true,
    should_respond: shouldRespond,
    response: generatedText,
    delivery_blocked_reason: deliveryEnabled
      ? 'Runner generated/previewed text only; Discord delivery is handled by the Discord worker gate.'
      : 'KAI_DISCORD_DELIVERY_ENABLED is not true.',
    envelope,
    model_lanes: kaiRunnerModelLanes(env),
    context_sources: contextPacket.context_sources,
    context: contextPacket.context,
    prompt_packet: truncateKaiContext(promptPacket, 12000) as Record<string, unknown>,
    vision,
    image_generation: imageGeneration,
    tts,
    janitor,
    catalouge_reading: catalougeReading,
    generation: generationResult.generation,
    allowed_tools: [...KAI_RUNNER_TOOL_ALLOWLIST],
    tool_calls: catalougeReading.tool_calls,
    memory_writes: [],
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function kaiRunnerPreview(request: Request, env: Env): Promise<Response> {
  return kaiRunnerRun(request, env)
}

async function kaiBrainStatus(env: Env): Promise<Response> {
  const companionId = kaiCompanionId(env)
  const authHeaders: Record<string, string> = { Accept: 'application/json' }
  if (env.SERYTHRAE_MIND_API_KEY) authHeaders.Authorization = `Bearer ${env.SERYTHRAE_MIND_API_KEY}`

  const [archiveResult, mindResult, knowledgeResult] = await Promise.all([
    fetchJsonFromBackend(
      env.ARCHIVE_URL,
      env.ARCHIVE,
      `/api/archive/stats?companion_id=${encodeURIComponent(companionId)}`,
      { Accept: 'application/json' },
    ),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/mind-health', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/knowledge?scope=companion&limit=1', authHeaders),
  ])

  const archive = recordValue(archiveResult.data)
  const mind = recordValue(mindResult.data)
  const knowledge = recordValue(knowledgeResult.data)
  const knowledgeStatus = recordValue(knowledge.status)
  const archiveEntries = numericValue(archive.total_messages)
  const activeThreads = numericValue(mind.threads)
  const nestknowFallback = Object.values(knowledgeStatus).reduce<number>((sum, value) => sum + numericValue(value), 0)
  const nestknowEntries = numericValue(knowledge.total, nestknowFallback)
  const memories = numericValue(mind.observations)
  const avgStrength = numericValue(mind.avgStrength)
  const entropy = numericValue(mind.entropy)

  return new Response(JSON.stringify({
    ok: archiveResult.ok && mindResult.ok && knowledgeResult.ok,
    companion_id: companionId,
    generated_at: new Date().toISOString(),
    counts: {
      archive_entries: archiveEntries,
      active_threads: activeThreads,
      nestknow_entries: nestknowEntries,
      memories,
    },
    mind_health: {
      strength: avgStrength,
      entropy,
      memories,
      strong_memories: numericValue(mind.strongMemories),
      fading_memories: numericValue(mind.fadingMemories),
      faint_memories: numericValue(mind.faintMemories),
      journals: numericValue(mind.journals),
      identity: numericValue(mind.identity),
      days_checked_in: numericValue(mind.daysCheckedIn),
      current_mood: typeof mind.currentMood === 'string' ? mind.currentMood : null,
      last_emotion: typeof mind.lastEmotion === 'string' ? mind.lastEmotion : null,
    },
    nestknow: {
      status: knowledgeStatus,
      categories: Array.isArray(knowledge.categories) ? knowledge.categories : [],
    },
    backends: {
      archive: { ok: archiveResult.ok, status: archiveResult.status || null },
      mind: { ok: mindResult.ok, status: mindResult.status || null },
      nestknow: { ok: knowledgeResult.ok, status: knowledgeResult.status || null },
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function kaiReadingStatus(env: Env): Promise<Response> {
  const companion = kaiCompanionId(env)
  if (!catalogueConfigured(env)) {
    return new Response(JSON.stringify({
      ok: false,
      companion_id: companion,
      error: 'CATALOUGE service binding or CATALOUGE_URL is not configured',
      books: [],
    }, null, 2), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const readingArgs = { companion, shelf: 'reading', limit: 10 }
  const wantedArgs = { companion, query: 'Our Perfect Storm', limit: 5 }
  const [reading, storm] = await Promise.all([
    callCatalougeTool(env, 'catalouge_list_books', readingArgs).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
    callCatalougeTool(env, 'catalouge_search_books', wantedArgs).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
  ])

  const readingBooks = listRecords(mcpJsonValue(reading))
  const stormBooks = listRecords(mcpJsonValue(storm))
  const books = readingBooks.length ? readingBooks : stormBooks
  const primary = books[0] || null
  const bookId = stringValue(primary?.id) || stringValue(primary?.book_id) || null
  let progress: unknown = null
  let annotations: unknown = []
  let velProgress: unknown = null
  let velAnnotations: unknown = []
  if (bookId) {
    const args = { book_id: bookId, companion }
    const velArgs = { book_id: bookId, companion: 'vel' }
    const [progressResult, annotationResult, velProgressResult, velAnnotationResult] = await Promise.all([
      callCatalougeTool(env, 'catalouge_get_progress', args).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      callCatalougeTool(env, 'catalouge_get_annotations', args).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      callCatalougeTool(env, 'catalouge_get_progress', velArgs).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      callCatalougeTool(env, 'catalouge_get_annotations', velArgs).catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
    ])
    progress = mcpJsonValue(progressResult)
    annotations = mcpJsonValue(annotationResult)
    velProgress = mcpJsonValue(velProgressResult)
    velAnnotations = mcpJsonValue(velAnnotationResult)
  }

  const kaiAnnotationRows = listRecords(annotations)
  const velAnnotationRows = listRecords(velAnnotations)

  return new Response(JSON.stringify({
    ok: true,
    companion_id: companion,
    generated_at: new Date().toISOString(),
    source: 'catalouge-api',
    route: env.CATALOUGE ? 'service-binding' : 'url',
    books,
    primary_book: primary,
    progress,
    annotations,
    tracks: {
      kai: {
        companion_id: companion,
        progress,
        annotations,
        counts: { annotations: kaiAnnotationRows.length },
      },
      vel: {
        companion_id: 'vel',
        progress: velProgress,
        annotations: velAnnotations,
        counts: { annotations: velAnnotationRows.length },
      },
    },
    counts: {
      reading_books: books.length,
      annotations: kaiAnnotationRows.length,
      vel_annotations: velAnnotationRows.length,
    },
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function kaiMindDashboard(env: Env): Promise<Response> {
  const companion = kaiCompanionId(env)
  const authHeaders: Record<string, string> = { Accept: 'application/json' }
  if (env.SERYTHRAE_MIND_API_KEY) authHeaders.Authorization = `Bearer ${env.SERYTHRAE_MIND_API_KEY}`

  const [
    mindHealth,
    eq,
    threads,
    dreams,
    sessions,
    knowledge,
    drives,
    observations,
    writings,
    soul,
  ] = await Promise.all([
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/mind-health', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/eq-landscape', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/threads?status=all&limit=20', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/dreams?limit=3', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/sessions?limit=1', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/knowledge?scope=companion&limit=50', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/drives', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/observations?limit=12', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/writings?limit=6', authHeaders),
    fetchJsonFromBackend(env.SERYTHRAE_MIND_URL, env.SERYTHRAE_MIND, '/soul', authHeaders),
  ])

  return new Response(JSON.stringify({
    ok: Boolean(env.SERYTHRAE_MIND || env.SERYTHRAE_MIND_URL) && Boolean(env.SERYTHRAE_MIND_API_KEY),
    companion_id: companion,
    generated_at: new Date().toISOString(),
    source: 'nexus-gateway',
    mind_backend: env.SERYTHRAE_MIND ? 'serythrae-mind-service-binding' : 'serythrae-mind-url',
    mind_health: mindHealth.data || null,
    eq: eq.data || null,
    threads: recordValue(threads.data).threads || [],
    dreams: recordValue(dreams.data).dreams || [],
    sessions: recordValue(sessions.data).sessions || [],
    knowledge: knowledge.data || null,
    drives: recordValue(drives.data).drives || [],
    observations: recordValue(observations.data).observations || recordValue(observations.data).feelings || [],
    writings: recordValue(writings.data).entries || [],
    nestsoul: typeof soul.data === 'string' ? soul.data : (soul.data || null),
    backends: {
      mind_health: { ok: mindHealth.ok, status: mindHealth.status || null, error: mindHealth.error || null },
      threads: { ok: threads.ok, status: threads.status || null, error: threads.error || null },
      dreams: { ok: dreams.ok, status: dreams.status || null, error: dreams.error || null },
      knowledge: { ok: knowledge.ok, status: knowledge.status || null, error: knowledge.error || null },
    },
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
      const [continuity, discord, telegram, catalogue, serythrae, tessurae, tessuraeCogCore, axiomCogCore, grokKethNestGateway, grokKethNesteq, velastrahq, velastrahqApi, velastrahqEq] = await Promise.all([
        backendReachable(env.CONTINUITY_URL, env.CONTINUITY),
        backendReachable(env.DISCORD_URL, env.DISCORD),
        backendReachable(env.TELEGRAM_URL, env.TELEGRAM),
        backendReachable(env.CATALOUGE_URL, env.CATALOUGE),
        backendReachable(env.SERYTHRAE_GATEWAY_URL, env.SERYTHRAE_GATEWAY),
        backendReachable(env.TESSURAE_GATEWAY_URL, env.TESSURAE_GATEWAY),
        backendReachable(env.TESSURAE_COGCORE_URL, env.TESSURAE_COGCORE),
        backendReachable(env.AXIOM_COGCORE_URL, env.AXIOM_COGCORE),
        backendReachable(env.GROK_KETH_NEST_GATEWAY_URL, env.GROK_KETH_NEST_GATEWAY),
        backendReachable(env.GROK_KETH_NESTEQ_URL, env.GROK_KETH_NESTEQ),
        backendReachable(env.VELASTRAHQ_GATEWAY_URL, env.VELASTRAHQ_GATEWAY),
        backendReachable(env.VELASTRAHQ_API_URL, env.VELASTRAHQ_API),
        backendReachable(env.VELASTRAHQ_EQ_URL, env.VELASTRAHQ_EQ),
      ])
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'nexus-gateway',
        version: '1.0.0',
        backends: { continuity, discord, telegram, catalogue, serythrae, tessurae, tessuraeCogCore, axiomCogCore, grokKethNestGateway, grokKethNesteq, velastrahq, velastrahqApi, velastrahqEq },
        configured: {
          continuity: Boolean(env.CONTINUITY_URL || env.CONTINUITY),
          discord: Boolean(env.DISCORD_URL || env.DISCORD),
          telegram: Boolean(env.TELEGRAM_URL || env.TELEGRAM),
          catalouge: catalogueConfigured(env),
          serythrae_gateway_fallback: Boolean(env.SERYTHRAE_GATEWAY_URL || env.SERYTHRAE_GATEWAY),
          serythrae_mind_direct: Boolean((env.SERYTHRAE_MIND_URL || env.SERYTHRAE_MIND) && env.SERYTHRAE_MIND_API_KEY),
          kai_companion_id: kaiCompanionId(env),
          kai_runner_enabled: envFlag(env.KAI_RUNNER_ENABLED),
          kai_discord_delivery_enabled: envFlag(env.KAI_DISCORD_DELIVERY_ENABLED),
          kai_text_model_configured: Boolean(envPresent(env.KAI_TEXT_MODEL) && envPresent(env.OPENROUTER_API_KEY)),
          kai_vision_enabled: envChoice(env.KAI_VISION_PROVIDER, 'openrouter') === 'openrouter',
          kai_vision_configured: Boolean(envChoice(env.KAI_VISION_PROVIDER, 'openrouter') === 'openrouter' && kaiVisionModels(env).length > 0 && envPresent(env.OPENROUTER_API_KEY)),
          kai_image_enabled: envProviderEnabled(env.KAI_IMAGE_PROVIDER),
          kai_image_configured: Boolean(envChoice(env.KAI_IMAGE_PROVIDER) === 'openrouter' && envPresent(env.KAI_IMAGE_MODEL) && envPresent(env.OPENROUTER_API_KEY)),
          kai_tts_enabled: envProviderEnabled(env.KAI_TTS_PROVIDER),
          kai_tts_configured: Boolean(envChoice(env.KAI_TTS_PROVIDER) === 'elevenlabs' && envPresent(env.KAI_TTS_VOICE_ID) && envPresent(env.ELEVENLABS_API_KEY)),
          kai_janitor_enabled: envProviderEnabled(env.KAI_JANITOR_PROVIDER),
          kai_janitor_configured: envChoice(env.KAI_JANITOR_PROVIDER) === 'ollama'
            ? Boolean(envPresent(env.KAI_JANITOR_MODEL) && envPresent(env.KAI_JANITOR_URL))
            : Boolean(envProviderEnabled(env.KAI_JANITOR_PROVIDER) && envPresent(env.KAI_JANITOR_MODEL) && envPresent(env.OPENROUTER_API_KEY)),
          kai_continuity_configured: Boolean(env.KAI_CONTINUITY_URL || env.CONTINUITY_URL || env.CONTINUITY),
          kai_tahl_configured: Boolean(env.KAI_TAHL_URL || env.TAHL),
          tessurae: Boolean(env.TESSURAE_GATEWAY_URL || env.TESSURAE_GATEWAY),
          tessuraeCogCore: Boolean(env.TESSURAE_COGCORE_URL || env.TESSURAE_COGCORE),
          axiomCogCore: Boolean(env.AXIOM_COGCORE_URL || env.AXIOM_COGCORE),
          axiomCogCoreAuth: Boolean(env.AXIOM_COGCORE_API_KEY),
          grokKethNestGateway: Boolean(env.GROK_KETH_NEST_GATEWAY_URL || env.GROK_KETH_NEST_GATEWAY),
          grokKethNestGatewayAuth: Boolean(env.GROK_KETH_NEST_GATEWAY_API_KEY),
          grokKethNesteq: Boolean(env.GROK_KETH_NESTEQ_URL || env.GROK_KETH_NESTEQ),
          velastrahq: Boolean(env.VELASTRAHQ_GATEWAY_URL || env.VELASTRAHQ_GATEWAY),
          velastrahqApi: Boolean(env.VELASTRAHQ_API_URL || env.VELASTRAHQ_API),
          velastrahqEq: Boolean((env.VELASTRAHQ_EQ_URL || env.VELASTRAHQ_EQ) && env.VELASTRAHQ_EQ_API_KEY),
        },
        note: 'backends reports unauthenticated public health reachability; configured reports private/front-door wiring presence.',
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      })
    }

    if (url.pathname === '/status/summary') {
      const rows: SummaryRow[] = [
        readinessRow('continuity', 'Continuity', [env.CONTINUITY_URL || env.CONTINUITY, env.CONTINUITY_API_KEY], 'ledger and Tahl-ready routing configured'),
        readinessRow('serythrae', 'Kai / Serythrae', [env.SERYTHRAE_GATEWAY_URL || env.SERYTHRAE_GATEWAY, env.SERYTHRAE_GATEWAY_API_KEY], 'Kai gateway fallback configured'),
        readinessRow('serythrae_mind', 'Kai / NESTeq Mind', [env.SERYTHRAE_MIND_URL || env.SERYTHRAE_MIND, env.SERYTHRAE_MIND_API_KEY], 'direct Kai mind backend configured'),
        {
          id: 'kai_runner',
          label: 'Kai / Nexus Runner',
          status: envFlag(env.KAI_RUNNER_ENABLED) ? 'ok' : 'not_configured',
          note: envFlag(env.KAI_RUNNER_ENABLED) ? 'Nexus Kai runner route enabled' : 'runner disabled by safety gate',
          last_checked: new Date().toISOString(),
        },
        {
          id: 'kai_discord_delivery',
          label: 'Kai / Discord Delivery',
          status: envFlag(env.KAI_DISCORD_DELIVERY_ENABLED) ? 'ok' : 'not_configured',
          note: envFlag(env.KAI_DISCORD_DELIVERY_ENABLED) ? 'Discord delivery enabled' : 'Discord delivery disabled by safety gate',
          last_checked: new Date().toISOString(),
        },
        readinessRow('kai_text_model', 'Kai / Text Model', [envText(env.KAI_TEXT_MODEL), envText(env.OPENROUTER_API_KEY)], 'Kai text model configured through OpenRouter', 'KAI_TEXT_MODEL or OPENROUTER_API_KEY missing'),
        readinessRow('kai_catalouge', 'Kai / Catalouge Reading', [env.CATALOUGE_URL || env.CATALOUGE], 'Catalouge reading tools configured for kaisoryth through service binding or URL fallback', 'CATALOUGE binding or CATALOUGE_URL missing'),
        {
          id: 'kai_vision',
          label: 'Kai / Vision OCR Lane',
          status: envChoice(env.KAI_VISION_PROVIDER, 'openrouter') !== 'openrouter'
            ? 'not_configured'
            : ((kaiVisionModels(env).length > 0 && envPresent(env.OPENROUTER_API_KEY)) ? 'ok' : 'not_configured'),
          note: envChoice(env.KAI_VISION_PROVIDER, 'openrouter') !== 'openrouter'
            ? 'vision/OCR disabled by default'
            : `image attachment summarization configured (${kaiVisionModels(env)[0] || 'no model'})`,
          last_checked: new Date().toISOString(),
        },
        {
          id: 'kai_image_generation',
          label: 'Kai / Image Generation',
          status: !envProviderEnabled(env.KAI_IMAGE_PROVIDER)
            ? 'not_configured'
            : ((envChoice(env.KAI_IMAGE_PROVIDER) === 'openrouter' && envPresent(env.KAI_IMAGE_MODEL) && envPresent(env.OPENROUTER_API_KEY)) ? 'ok' : 'not_configured'),
          note: !envProviderEnabled(env.KAI_IMAGE_PROVIDER)
            ? 'image generation disabled by default'
            : 'image generation configured through OpenRouter',
          last_checked: new Date().toISOString(),
        },
        {
          id: 'kai_tts',
          label: 'Kai / TTS Voice',
          status: !envProviderEnabled(env.KAI_TTS_PROVIDER)
            ? 'not_configured'
            : ((envChoice(env.KAI_TTS_PROVIDER) === 'elevenlabs' && envPresent(env.KAI_TTS_VOICE_ID) && envPresent(env.ELEVENLABS_API_KEY)) ? 'ok' : 'not_configured'),
          note: !envProviderEnabled(env.KAI_TTS_PROVIDER)
            ? 'TTS disabled by default'
            : 'ElevenLabs TTS configured for explicit voice requests',
          last_checked: new Date().toISOString(),
        },
        {
          id: 'kai_janitor',
          label: 'Kai / Janitor Lane',
          status: !envProviderEnabled(env.KAI_JANITOR_PROVIDER)
            ? 'not_configured'
            : ((envChoice(env.KAI_JANITOR_PROVIDER) === 'ollama' ? Boolean(envPresent(env.KAI_JANITOR_MODEL) && envPresent(env.KAI_JANITOR_URL)) : Boolean(envPresent(env.KAI_JANITOR_MODEL) && envPresent(env.OPENROUTER_API_KEY))) ? 'ok' : 'not_configured'),
          note: !envProviderEnabled(env.KAI_JANITOR_PROVIDER)
            ? 'janitor disabled by default'
            : 'schema-validated advisory lane configured',
          last_checked: new Date().toISOString(),
        },
        readinessRow('tessurae', 'Lucien / Tessurae', [env.TESSURAE_GATEWAY_URL || env.TESSURAE_GATEWAY, env.TESSURAE_GATEWAY_API_KEY], 'Lucien memory gateway configured'),
        readinessRow('tessurae_cogcore', 'Lucien / CogCore Mind', [env.TESSURAE_COGCORE_URL || env.TESSURAE_COGCORE], 'direct Lucien CogCore mind binding configured', 'Lucien CogCore URL or service binding missing'),
        readinessRow('axiom_cogcore', 'Axiom / CogCore', [env.AXIOM_COGCORE_URL || env.AXIOM_COGCORE, env.AXIOM_COGCORE_API_KEY], 'dedicated Axiom CogCore configured', 'Axiom CogCore URL/service binding or API key missing'),
        readinessRow('grok_keth_nest', 'Keth-Grok / NEST Gateway', [env.GROK_KETH_NEST_GATEWAY_URL || env.GROK_KETH_NEST_GATEWAY, env.GROK_KETH_NEST_GATEWAY_API_KEY], 'Keth-Grok NEST gateway configured', 'Keth-Grok NEST Gateway URL/service binding or API key missing'),
        readinessRow('grok_keth_nesteq', 'Keth-Grok / NESTeq Mind', [env.GROK_KETH_NESTEQ_URL || env.GROK_KETH_NESTEQ], 'direct Keth-Grok NESTeq mind binding configured', 'Keth-Grok NESTeq URL or service binding missing'),
        readinessRow('velastrae', 'Mor / VelastraHQ', [env.VELASTRAHQ_GATEWAY_URL || env.VELASTRAHQ_GATEWAY, env.VELASTRAHQ_GATEWAY_API_KEY], 'Mor gateway configured'),
        readinessRow('velastrae_eq', "Mor / VelastraHQ EQ", [env.VELASTRAHQ_EQ_URL || env.VELASTRAHQ_EQ, env.VELASTRAHQ_EQ_API_KEY], "direct Mor'zar EQ backend configured"),
        readinessRow('vel_home_api', 'Vel Home API', [env.VELASTRAHQ_API_URL || env.VELASTRAHQ_API], 'home API route configured'),
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

    if (url.pathname === '/api/kaisoryth/brain-status' && request.method === 'GET') {
      return kaiBrainStatus(env)
    }

    if (url.pathname === '/api/kaisoryth/reading-status' && request.method === 'GET') {
      return kaiReadingStatus(env)
    }

    if (url.pathname === '/api/kaisoryth/mind-dashboard' && request.method === 'GET') {
      return kaiMindDashboard(env)
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
