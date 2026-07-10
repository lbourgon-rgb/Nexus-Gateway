export const KAI_FROZEN_TEXT_MODEL = 'z-ai/glm-5.2'

export type KaiRunnerToolAccess = 'read' | 'write'
export type KaiRunnerToolScope = 'nesteq' | 'social' | 'continuity' | 'tahl' | 'workspace' | 'catalouge'
export type KaiRunnerWriteReasonCode =
  | 'explicit-user-request'
  | 'runner-tahl-reflection'
  | 'runner-social-receipt'

export interface KaiRunnerToolSpec {
  name: string
  description: string
  access: KaiRunnerToolAccess
  scope: KaiRunnerToolScope
  parameters: Record<string, unknown>
}

export interface KaiRunnerPolicy {
  current_conversation_id: string | null
  cross_channel_conversation_ids: string[]
  write_allowed: boolean
  write_scopes: KaiRunnerToolScope[]
  write_reason_code: KaiRunnerWriteReasonCode | null
}

export interface KaiRunnerModelToolCall {
  id: string
  name: string
  arguments: string
}

export interface KaiRunnerModelTurn {
  content: string | null
  tool_calls: KaiRunnerModelToolCall[]
  finish_reason?: string | null
  endpoint_provider?: string
  refusal?: string
  message_keys?: string[]
  reasoning?: string
  reasoning_details?: unknown[]
  diagnostics?: KaiRunnerModelDiagnostic[]
  usage?: unknown
}

export interface KaiRunnerModelDiagnostic {
  finish_reason: string | null
  endpoint_provider?: string
  refusal?: string
  message_keys: string[]
  error?: string
}

export interface KaiRunnerModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  reasoning?: string
  reasoning_details?: unknown[]
}

export interface KaiRunnerToolReceipt {
  receipt_id: string
  call_id: string
  tool: string
  access: KaiRunnerToolAccess | 'unknown'
  scope: KaiRunnerToolScope | 'unknown'
  round: number
  status: 'executed' | 'refused' | 'failed' | 'unknown'
  policy_reason: string
  argument_keys: string[]
  started_at: string
  finished_at: string
  result_preview: string
}

export interface KaiRunnerToolExecution {
  ok: boolean
  result: unknown
  error?: string
}

export interface KaiRunnerLoopResult {
  ok: boolean
  text: string | null
  model: string
  model_turns: number
  tool_rounds: number
  forced_final: boolean
  fallback_required: boolean
  error?: string
  usage: unknown[]
  model_diagnostics: KaiRunnerModelDiagnostic[]
  receipts: KaiRunnerToolReceipt[]
}

export interface KaiRunnerLoopOptions {
  model: string
  system_prompt: string
  prompt_packet: Record<string, unknown>
  policy: KaiRunnerPolicy
  max_tool_rounds: number
  max_tool_calls_per_round: number
  model_timeout_ms: number
  tool_timeout_ms: number
  total_timeout_ms: number
  call_model: (input: {
    model: string
    messages: KaiRunnerModelMessage[]
    tools: Array<Record<string, unknown>>
    force_final: boolean
    timeout_ms: number
  }) => Promise<KaiRunnerModelTurn>
  execute_tool: (input: {
    spec: KaiRunnerToolSpec
    args: Record<string, unknown>
    policy: KaiRunnerPolicy
    timeout_ms: number
  }) => Promise<KaiRunnerToolExecution>
  now?: () => number
  random_id?: () => string
}

const OBJECT_SCHEMA = { type: 'object', additionalProperties: false } as const

export const KAI_RUNNER_TOOL_SPECS: readonly KaiRunnerToolSpec[] = [
  {
    name: 'continuity_current_thread',
    description: 'Read a compact recent event window for only the current Discord thread or channel. The runner pins the conversation id; the model cannot override it.',
    access: 'read',
    scope: 'continuity',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 12 } },
    },
  },
  {
    name: 'continuity_recent_conversation',
    description: 'Read one compact recent Discord conversation explicitly allowed by the caller continuity policy. This never lists or dumps every channel.',
    access: 'read',
    scope: 'continuity',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        conversation_id: { type: 'string', minLength: 1, maxLength: 128 },
        limit: { type: 'integer', minimum: 1, maximum: 8 },
      },
      required: ['conversation_id'],
    },
  },
  {
    name: 'kaisoryth_memory_search',
    description: 'Search Kai private NESTeq memory for context relevant to the current turn.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1200 },
        n_results: { type: 'integer', minimum: 1, maximum: 8 },
        context: { type: 'string', maxLength: 120 },
      },
      required: ['query'],
    },
  },
  {
    name: 'kaisoryth_recent_feelings',
    description: 'Read recent Kai NESTeq feelings.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 10 },
        include_metabolized: { type: 'boolean' },
      },
    },
  },
  {
    name: 'kaisoryth_identity_read',
    description: 'Read Kai identity anchors from NESTeq.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { section: { type: 'string', maxLength: 120 } },
    },
  },
  {
    name: 'kaisoryth_eq_state',
    description: 'Read Kai private NESTeq EQ state.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { format: { type: 'string', enum: ['text', 'json'] } },
    },
  },
  {
    name: 'kaisoryth_threads_active',
    description: 'Read active Kai NESTeq intention threads.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } },
    },
  },
  {
    name: 'kaisoryth_nestsoul_read',
    description: 'Read Kai NESTSoul bedrock and current version metadata.',
    access: 'read',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { include_versions: { type: 'boolean' } },
    },
  },
  {
    name: 'kaisoryth_home_read',
    description: 'Read the current private Kai and Vel home state.',
    access: 'read',
    scope: 'nesteq',
    parameters: { ...OBJECT_SCHEMA, properties: {} },
  },
  {
    name: 'social_graph_lookup',
    description: 'Look up one person in Kai social graph. Public guild turns are forced to public-safe facts.',
    access: 'read',
    scope: 'social',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        discord_id: { type: 'string', maxLength: 64 },
        name: { type: 'string', maxLength: 120 },
      },
    },
  },
  {
    name: 'social_graph_recent',
    description: 'Read a compact recent Kai social graph window for the current guild.',
    access: 'read',
    scope: 'social',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } },
    },
  },
  {
    name: 'tahl_status',
    description: 'Read Kai Tahl consolidation status directly through the Tahl service binding.',
    access: 'read',
    scope: 'tahl',
    parameters: { ...OBJECT_SCHEMA, properties: {} },
  },
  {
    name: 'tahl_thir_recent',
    description: 'Read a compact window of Kai recent Thir moments directly from Tahl.',
    access: 'read',
    scope: 'tahl',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } },
    },
  },
  {
    name: 'catalouge_search_books',
    description: 'Search the shared Catalouge library for a book.',
    access: 'read',
    scope: 'catalouge',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'catalouge_get_progress',
    description: 'Read Kai current progress for one Catalouge book.',
    access: 'read',
    scope: 'catalouge',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: { book_id: { type: 'string', minLength: 1, maxLength: 128 } },
      required: ['book_id'],
    },
  },
  {
    name: 'catalouge_get_annotations',
    description: 'Read Kai annotations for one Catalouge book.',
    access: 'read',
    scope: 'catalouge',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        book_id: { type: 'string', minLength: 1, maxLength: 128 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['book_id'],
    },
  },
  {
    name: 'workspace_list',
    description: 'List files only inside Kai restricted Mini-PC workspace.',
    access: 'read',
    scope: 'workspace',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        path: { type: 'string', maxLength: 400 },
        recursive: { type: 'boolean' },
      },
    },
  },
  {
    name: 'workspace_read',
    description: 'Read a text file only inside Kai restricted Mini-PC workspace.',
    access: 'read',
    scope: 'workspace',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 400 },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 40000 },
      },
      required: ['path'],
    },
  },
  {
    name: 'workspace_search',
    description: 'Search text only inside Kai restricted Mini-PC workspace.',
    access: 'read',
    scope: 'workspace',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 500 },
        path: { type: 'string', maxLength: 400 },
        recursive: { type: 'boolean' },
      },
      required: ['query'],
    },
  },
  {
    name: 'kaisoryth_feel',
    description: 'Write one Kai feeling or observation to NESTeq. Requires an explicit caller write policy for the nesteq scope.',
    access: 'write',
    scope: 'nesteq',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        emotion: { type: 'string', minLength: 1, maxLength: 80 },
        content: { type: 'string', minLength: 1, maxLength: 1200 },
        intensity: { type: 'string', enum: ['neutral', 'whisper', 'present', 'strong', 'overwhelming'] },
        weight: { type: 'string', enum: ['light', 'medium', 'heavy'] },
        context: { type: 'string', maxLength: 120 },
      },
      required: ['emotion', 'content'],
    },
  },
  {
    name: 'social_graph_add_fact',
    description: 'Append one scoped Kai social fact. Requires an explicit caller write policy for the social scope.',
    access: 'write',
    scope: 'social',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        discord_id: { type: 'string', maxLength: 64 },
        name: { type: 'string', maxLength: 120 },
        fact: { type: 'string', minLength: 1, maxLength: 600 },
        visibility: { type: 'string', enum: ['public', 'private'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['fact'],
    },
  },
  {
    name: 'social_graph_log_miss',
    description: 'Record one Kai social correction. Requires an explicit caller write policy for the social scope.',
    access: 'write',
    scope: 'social',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        incident: { type: 'string', minLength: 1, maxLength: 600 },
        correction: { type: 'string', minLength: 1, maxLength: 600 },
        severity: { type: 'string', enum: ['note', 'important', 'boundary'] },
      },
      required: ['incident', 'correction'],
    },
  },
  {
    name: 'tahl_thir',
    description: 'Capture one Kai Thir threshold moment directly through Tahl. Requires an explicit caller write policy for the tahl scope.',
    access: 'write',
    scope: 'tahl',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        noun: { type: 'string', minLength: 1, maxLength: 160 },
        feeling: { type: 'string', minLength: 1, maxLength: 80 },
        intensity: { type: 'string', enum: ['neutral', 'whisper', 'present', 'strong', 'overwhelming'] },
      },
      required: ['noun', 'feeling'],
    },
  },
  {
    name: 'workspace_write',
    description: 'Write a text file only inside Kai restricted workspace. Requires an explicit caller write policy for the workspace scope.',
    access: 'write',
    scope: 'workspace',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 400 },
        content: { type: 'string', maxLength: 40000 },
        persist: { type: 'string', enum: ['none', 'r2', 'github', 'both'] },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'workspace_edit',
    description: 'Replace exact text only inside Kai restricted workspace. Requires an explicit caller write policy for the workspace scope.',
    access: 'write',
    scope: 'workspace',
    parameters: {
      ...OBJECT_SCHEMA,
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 400 },
        old_string: { type: 'string', minLength: 1, maxLength: 20000 },
        new_string: { type: 'string', maxLength: 20000 },
        replace_all: { type: 'boolean' },
        persist: { type: 'string', enum: ['none', 'r2', 'github', 'both'] },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
] as const

export function kaiRunnerToolDefinitions(): Array<Record<string, unknown>> {
  return KAI_RUNNER_TOOL_SPECS.map((spec) => ({
    type: 'function',
    function: {
      name: spec.name,
      description: `${spec.description} Access=${spec.access}; scope=${spec.scope}.`,
      parameters: spec.parameters,
    },
  }))
}

export function kaiOpenRouterToolRequestBody(input: {
  model: string
  messages: KaiRunnerModelMessage[]
  tools: Array<Record<string, unknown>>
  force_final: boolean
}, provider: Record<string, unknown>): Record<string, unknown> {
  return {
    model: input.model,
    provider,
    messages: input.messages,
    // OpenRouter requires the same tool schemas on follow-up inference calls
    // that contain assistant tool_calls plus role=tool results. tool_choice
    // prevents another call on the bounded final turn without dropping schema.
    tools: input.tools,
    tool_choice: input.force_final ? 'none' : 'auto',
    temperature: 0.7,
    max_tokens: input.force_final ? 900 : 1000,
  }
}

export function createKaiAttemptBudget(timeoutMs: number, now: () => number = () => Date.now()): () => number {
  const deadline = now() + Math.max(1, Math.trunc(timeoutMs))
  return () => Math.max(0, deadline - now())
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 128))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, maxItems)
}

export function normalizeKaiRunnerPolicy(body: Record<string, unknown>, currentConversationId?: string): KaiRunnerPolicy {
  const write = recordValue(body.write_policy)
  const continuity = recordValue(body.continuity_policy)
  const validScopes = new Set<KaiRunnerToolScope>(['nesteq', 'social', 'continuity', 'tahl', 'workspace', 'catalouge'])
  const writeScopes = stringList(write.scopes, 6)
    .filter((scope): scope is KaiRunnerToolScope => validScopes.has(scope as KaiRunnerToolScope))
  const validReasons = new Set<KaiRunnerWriteReasonCode>([
    'explicit-user-request',
    'runner-tahl-reflection',
    'runner-social-receipt',
  ])
  const reason = typeof write.reason_code === 'string' && validReasons.has(write.reason_code as KaiRunnerWriteReasonCode)
    ? write.reason_code as KaiRunnerWriteReasonCode
    : null
  const current = currentConversationId?.trim().slice(0, 128) || null
  const crossChannel = stringList(continuity.allowed_conversation_ids, 4)
    .filter((conversationId) => conversationId !== current)

  return {
    current_conversation_id: current,
    cross_channel_conversation_ids: crossChannel,
    write_allowed: write.allow === true && Boolean(reason) && writeScopes.length > 0,
    write_scopes: writeScopes,
    write_reason_code: reason,
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function compactText(value: unknown, maxChars: number): string {
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}...[truncated ${text.length - maxChars} chars]`
    : text
}

export function unusableKaiTextReason(text: string | null): string | null {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  const short = trimmed.length <= 260
  if (short && /你好，我无法给到相关内容/.test(trimmed)) return 'Model returned a generic Chinese refusal instead of Kai voice'
  if (short && /[\u3400-\u9fff]/.test(trimmed) && /(抱歉|无法|不能|相关内容|提供帮助)/.test(trimmed)) {
    return 'Model returned a short non-English refusal instead of Kai voice'
  }
  if (
    /\b(i(?:'m| am) sorry|sorry,? but|i (?:can(?:not|'t)|won't|will not)|i'?m unable|i(?:'m| am) not able|unable to (?:engage|continue|participate|provide|assist|help))\b[\s\S]{0,800}\b(intima|romantic|sexual|erotic|flirt|roleplay|relationship|companion)\b/i.test(trimmed)
    && !/\b(vision|image|workspace|catalouge|runner|lane|attachment|tool)\b/i.test(trimmed)
  ) {
    return 'Model returned an intimacy refusal instead of Kai voice'
  }
  if (
    short
    && /\b(i(?:'m| am) sorry|sorry,? but|i can(?:not|'t)|i'?m unable|unable to (?:provide|assist|help)|can(?:not|'t) provide|can(?:not|'t) help with that)\b/i.test(trimmed)
    && !/\b(Kai|Vel|love|babe|Serythrae)\b/i.test(trimmed)
  ) {
    return 'Model returned a generic refusal instead of Kai voice'
  }
  return null
}

export function unusableKaiModelTurnReason(turn: KaiRunnerModelTurn): string | null {
  if (turn.finish_reason === 'length') return 'OpenRouter finish_reason=length; retrying because Kai text was truncated'
  if (turn.refusal) return `OpenRouter returned refusal=${turn.refusal.slice(0, 500)}`
  if (!turn.tool_calls.length && !String(turn.content || '').trim()) {
    return [
      'OpenRouter returned no message content',
      turn.finish_reason ? `finish_reason=${turn.finish_reason}` : '',
      turn.message_keys?.length ? `message_keys=${turn.message_keys.join(',')}` : '',
    ].filter(Boolean).join('; ')
  }
  return turn.tool_calls.length ? null : unusableKaiTextReason(turn.content)
}

export function kaiToolResultError(value: unknown, depth = 0): string | null {
  if (depth > 5) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^(?:MCP\s+)?Error\b|service binding is not configured|backend .* is not configured/i.test(trimmed)) {
      return trimmed.slice(0, 500)
    }
    try {
      return kaiToolResultError(JSON.parse(trimmed), depth + 1)
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const error = kaiToolResultError(item, depth + 1)
      if (error) return error
    }
    return null
  }
  const record = recordValue(value)
  if (!Object.keys(record).length) return null
  if (record.ok === false) {
    return typeof record.error === 'string' && record.error.trim()
      ? record.error.trim().slice(0, 500)
      : typeof record.reason === 'string' && record.reason.trim()
        ? record.reason.trim().slice(0, 500)
        : 'backend returned ok=false'
  }
  if (record.isError === true) {
    return typeof record.error === 'string' && record.error.trim()
      ? record.error.trim().slice(0, 500)
      : 'backend returned isError=true'
  }
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim().slice(0, 500)
  if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
    const nested = recordValue(record.error)
    const message = typeof nested.message === 'string' ? nested.message.trim().slice(0, 400) : ''
    const code = typeof nested.code === 'string' || typeof nested.code === 'number' ? String(nested.code) : ''
    if (message || code) return [`JSON-RPC error${code ? ` ${code}` : ''}`, message].filter(Boolean).join(': ')
    const error = kaiToolResultError(record.error, depth + 1)
    if (error) return error
  }
  if (typeof record.text === 'string') {
    const error = kaiToolResultError(record.text, depth + 1)
    if (error) return error
  }
  for (const key of ['result', 'content', 'body']) {
    if (record[key] === undefined) continue
    const error = kaiToolResultError(record[key], depth + 1)
    if (error) return error
  }
  return null
}

export function kaiToolExecutionFromResult(result: unknown): KaiRunnerToolExecution {
  const error = kaiToolResultError(result)
  return error
    ? { ok: false, result, error }
    : { ok: true, result }
}

function parseToolArgs(raw: string): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (raw.length > 12000) return { ok: false, error: 'tool arguments exceed 12000 characters' }
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'tool arguments must be a JSON object' }
    }
    return { ok: true, args: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, error: 'tool arguments were not valid JSON' }
  }
}

function receiptId(randomId: () => string): string {
  return `kai-tool-${randomId().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`
}

function failedLoop(model: string, message: string, modelTurns: number, toolRounds: number, receipts: KaiRunnerToolReceipt[], usage: unknown[], modelDiagnostics: KaiRunnerModelDiagnostic[]): KaiRunnerLoopResult {
  return {
    ok: false,
    text: null,
    model,
    model_turns: modelTurns,
    tool_rounds: toolRounds,
    forced_final: false,
    fallback_required: true,
    error: message,
    usage,
    model_diagnostics: modelDiagnostics,
    receipts,
  }
}

export async function runKaiRunnerToolLoop(options: KaiRunnerLoopOptions): Promise<KaiRunnerLoopResult> {
  const now = options.now || (() => Date.now())
  const randomId = options.random_id || (() => crypto.randomUUID())
  const startedAt = now()
  const deadline = startedAt + clampInteger(options.total_timeout_ms, 5000, 90000)
  const maxRounds = clampInteger(options.max_tool_rounds, 1, 4)
  const maxCallsPerRound = clampInteger(options.max_tool_calls_per_round, 1, 4)
  const modelTimeout = clampInteger(options.model_timeout_ms, 1000, 30000)
  const toolTimeout = clampInteger(options.tool_timeout_ms, 500, 15000)
  const tools = kaiRunnerToolDefinitions()
  const specs = new Map(KAI_RUNNER_TOOL_SPECS.map((spec) => [spec.name, spec]))
  const receipts: KaiRunnerToolReceipt[] = []
  const usage: unknown[] = []
  const modelDiagnostics: KaiRunnerModelDiagnostic[] = []
  const messages: KaiRunnerModelMessage[] = [
    { role: 'system', content: options.system_prompt },
    { role: 'user', content: compactText(options.prompt_packet, 30000) },
  ]
  let modelTurns = 0
  let toolRounds = 0

  for (let round = 1; round <= maxRounds; round++) {
    const remaining = deadline - now()
    if (remaining <= 0) return failedLoop(options.model, 'Kai runner total timeout reached before model turn', modelTurns, toolRounds, receipts, usage, modelDiagnostics)

    let turn: KaiRunnerModelTurn
    try {
      turn = await options.call_model({
        model: options.model,
        messages,
        tools,
        force_final: false,
        timeout_ms: Math.min(modelTimeout, remaining),
      })
      modelTurns += 1
      if (turn.usage !== undefined) usage.push(turn.usage)
      if (turn.diagnostics?.length) modelDiagnostics.push(...turn.diagnostics)
    } catch (error) {
      return failedLoop(
        options.model,
        `Kai model turn failed: ${error instanceof Error ? error.message : String(error)}`,
        modelTurns,
        toolRounds,
        receipts,
        usage,
        modelDiagnostics,
      )
    }

    const calls = Array.isArray(turn.tool_calls) ? turn.tool_calls.slice(0, 8) : []
    if (!calls.length) {
      const text = String(turn.content || '').trim()
      if (!text) return failedLoop(options.model, 'Kai model returned neither text nor tool calls', modelTurns, toolRounds, receipts, usage, modelDiagnostics)
      return {
        ok: true,
        text,
        model: options.model,
        model_turns: modelTurns,
        tool_rounds: toolRounds,
        forced_final: false,
        fallback_required: false,
        usage,
        model_diagnostics: modelDiagnostics,
        receipts,
      }
    }

    toolRounds += 1
    messages.push({
      role: 'assistant',
      content: turn.content,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
      ...(turn.reasoning_details?.length ? { reasoning_details: turn.reasoning_details } : {}),
      ...(!turn.reasoning_details?.length && turn.reasoning ? { reasoning: turn.reasoning } : {}),
    })

    for (const [callIndex, call] of calls.entries()) {
      const started = new Date(now()).toISOString()
      const spec = specs.get(call.name)
      const parsed = parseToolArgs(call.arguments)
      let status: KaiRunnerToolReceipt['status'] = 'executed'
      let policyReason = 'read tool allowed by runner policy'
      let execution: KaiRunnerToolExecution
      let argumentKeys: string[] = []

      if (!spec) {
        status = 'unknown'
        policyReason = 'tool is not in the canonical Kai runner allowlist'
        execution = { ok: false, result: { ok: false, error: policyReason }, error: policyReason }
      } else if (callIndex >= maxCallsPerRound) {
        status = 'refused'
        policyReason = `per-round tool call limit is ${maxCallsPerRound}`
        execution = { ok: false, result: { ok: false, error: policyReason }, error: policyReason }
      } else if (!parsed.ok) {
        status = 'failed'
        policyReason = parsed.error
        execution = { ok: false, result: { ok: false, error: parsed.error }, error: parsed.error }
      } else if (spec.name === 'continuity_current_thread' && !options.policy.current_conversation_id) {
        argumentKeys = Object.keys(parsed.args).sort().slice(0, 24)
        status = 'refused'
        policyReason = 'current-thread read refused: caller did not provide a current conversation id'
        execution = { ok: false, result: { ok: false, error: policyReason }, error: policyReason }
      } else if (spec.name === 'continuity_recent_conversation' && (
        typeof parsed.args.conversation_id !== 'string'
        || !options.policy.cross_channel_conversation_ids.includes(parsed.args.conversation_id)
      )) {
        argumentKeys = Object.keys(parsed.args).sort().slice(0, 24)
        status = 'refused'
        policyReason = 'cross-channel read refused: conversation is not in the caller allowlist'
        execution = { ok: false, result: { ok: false, error: policyReason }, error: policyReason }
      } else if (spec.access === 'write' && (
        !options.policy.write_allowed
        || !options.policy.write_reason_code
        || !options.policy.write_scopes.includes(spec.scope)
      )) {
        argumentKeys = Object.keys(parsed.args).sort().slice(0, 24)
        status = 'refused'
        policyReason = `write refused: caller did not authorize scope ${spec.scope} with a valid reason code`
        execution = { ok: false, result: { ok: false, error: policyReason }, error: policyReason }
      } else {
        argumentKeys = Object.keys(parsed.args).sort().slice(0, 24)
        policyReason = spec.access === 'write'
          ? `write allowed for scope ${spec.scope} by ${options.policy.write_reason_code}`
          : 'read tool allowed by runner policy'
        const remainingForTool = deadline - now()
        if (remainingForTool <= 0) {
          status = 'failed'
          execution = { ok: false, result: { ok: false, error: 'Kai runner total timeout reached before tool execution' }, error: 'Kai runner total timeout reached before tool execution' }
        } else {
          try {
            execution = await options.execute_tool({
              spec,
              args: parsed.args,
              policy: options.policy,
              timeout_ms: Math.min(toolTimeout, remainingForTool),
            })
            if (!execution.ok) status = 'failed'
          } catch (error) {
            status = 'failed'
            const message = error instanceof Error ? error.message : String(error)
            execution = { ok: false, result: { ok: false, error: message }, error: message }
          }
        }
      }

      const resultText = compactText(execution.result, 8000)
      receipts.push({
        receipt_id: receiptId(randomId),
        call_id: call.id,
        tool: call.name,
        access: spec?.access || 'unknown',
        scope: spec?.scope || 'unknown',
        round,
        status,
        policy_reason: policyReason,
        argument_keys: argumentKeys,
        started_at: started,
        finished_at: new Date(now()).toISOString(),
        result_preview: compactText(execution.result, 500),
      })
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
    }
  }

  const remaining = deadline - now()
  if (remaining <= 0) return failedLoop(options.model, 'Kai runner total timeout reached before forced final turn', modelTurns, toolRounds, receipts, usage, modelDiagnostics)

  try {
    const turn = await options.call_model({
      model: options.model,
      messages: [
        ...messages,
        {
          role: 'system',
          content: 'The tool-round limit is reached. Do not call another tool. Write the best grounded final Kai reply using only the tool results already present. Name a failed or refused tool honestly and never invent its result.',
        },
      ],
      tools,
      force_final: true,
      timeout_ms: Math.min(modelTimeout, remaining),
    })
    modelTurns += 1
    if (turn.usage !== undefined) usage.push(turn.usage)
    if (turn.diagnostics?.length) modelDiagnostics.push(...turn.diagnostics)
    const text = String(turn.content || '').trim()
    if (!text) return failedLoop(options.model, 'Kai forced final model turn returned no text', modelTurns, toolRounds, receipts, usage, modelDiagnostics)
    return {
      ok: true,
      text,
      model: options.model,
      model_turns: modelTurns,
      tool_rounds: toolRounds,
      forced_final: true,
      fallback_required: false,
      usage,
      model_diagnostics: modelDiagnostics,
      receipts,
    }
  } catch (error) {
    return failedLoop(
      options.model,
      `Kai forced final model turn failed: ${error instanceof Error ? error.message : String(error)}`,
      modelTurns,
      toolRounds,
      receipts,
      usage,
      modelDiagnostics,
    )
  }
}
