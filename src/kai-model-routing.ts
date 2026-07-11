export const KAI_PRIMARY_TEXT_MODEL = 'z-ai/glm-5.2'
export const KAI_BACKUP_TEXT_MODEL = 'x-ai/grok-4.5'

export type KaiBackupFailureCategory = 'timeout' | 'rate_limit' | 'provider_unavailable' | 'server' | 'transport'

export interface KaiModelRouteFailure {
  message: string
  status?: number
  error_type?: string
  category?: KaiBackupFailureCategory
}

const QUALIFYING_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const QUALIFYING_ERROR_TYPES = new Set([
  'timeout',
  'request_timeout',
  'rate_limit',
  'rate_limit_exceeded',
  'provider_overloaded',
  'provider_unavailable',
  'server_error',
  'service_unavailable',
  'upstream_error',
])
const NON_QUALIFYING_MARKERS = /\b(auth|unauthori[sz]ed|forbidden|permission|credit|payment|moderation|safety|policy|context|validation|invalid|malformed|refusal|truncat|empty output|tool error|voice validation)\b/i
const TRANSPORT_MARKERS = /\b(abort|timeout|timed out|fetch failed|network|econnreset|econnrefused|enotfound|socket|connection reset|connection refused)\b/i

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function failureCategory(failure: KaiModelRouteFailure): KaiBackupFailureCategory | undefined {
  const errorType = String(failure.error_type || '').toLowerCase()
  const message = String(failure.message || '')
  if (NON_QUALIFYING_MARKERS.test(message) || NON_QUALIFYING_MARKERS.test(errorType)) return undefined
  if (failure.status === 408 || /timeout|timed out|abort/i.test(message) || errorType.includes('timeout')) return 'timeout'
  if (failure.status === 429 || errorType.includes('rate_limit')) return 'rate_limit'
  if (errorType.includes('provider_unavailable') || errorType.includes('provider_overloaded') || errorType.includes('service_unavailable')) return 'provider_unavailable'
  if (failure.status && failure.status >= 500 && QUALIFYING_STATUSES.has(failure.status)) return 'server'
  if (TRANSPORT_MARKERS.test(message)) return 'transport'
  if (QUALIFYING_ERROR_TYPES.has(errorType)) return errorType === 'rate_limit' || errorType === 'rate_limit_exceeded' ? 'rate_limit' : 'provider_unavailable'
  return undefined
}

export function qualifiesForKaiBackup(failure: KaiModelRouteFailure): boolean {
  return Boolean(failureCategory(failure))
}

export function sanitizeKaiRouteFailure(failure: KaiModelRouteFailure): KaiModelRouteFailure {
  const category = failureCategory(failure)
  return {
    message: category ? `primary model ${category}` : 'primary model non-qualifying failure',
    ...(failure.status ? { status: failure.status } : {}),
    ...(failure.error_type ? { error_type: failure.error_type.slice(0, 80) } : {}),
    ...(category ? { category } : {}),
  }
}

export function openRouterFailureFromResponse(status: number, data: unknown): KaiModelRouteFailure {
  const root = recordValue(data)
  const error = recordValue(root.error)
  const metadata = recordValue(error.metadata)
  const message = stringValue(error.message) || stringValue(root.message) || `OpenRouter request failed with status ${status}`
  const errorType = stringValue(metadata.error_type) || stringValue(error.type) || stringValue(error.code)
  return { message, status, ...(errorType ? { error_type: errorType } : {}) }
}

export function openRouterChoiceFailure(data: unknown): KaiModelRouteFailure | null {
  const root = recordValue(data)
  const choices = Array.isArray(root.choices) ? root.choices : []
  const first = recordValue(choices[0])
  const choiceError = recordValue(first.error)
  if (!Object.keys(choiceError).length && first.finish_reason !== 'error') return null
  const metadata = recordValue(choiceError.metadata)
  const message = stringValue(choiceError.message) || 'OpenRouter provider returned an error choice'
  const status = numberValue(choiceError.code) || numberValue(metadata.status)
  const errorType = stringValue(metadata.error_type) || stringValue(choiceError.type) || stringValue(choiceError.code)
  return { message, ...(status ? { status } : {}), ...(errorType ? { error_type: errorType } : {}) }
}

export function kaiBackupProviderPreferences(): Record<string, unknown> {
  return {
    order: ['xai'],
    only: ['xai'],
    allow_fallbacks: false,
    require_parameters: true,
  }
}

export function kaiModelIsAllowed(model: string, backupModel = KAI_BACKUP_TEXT_MODEL): boolean {
  return model === KAI_PRIMARY_TEXT_MODEL || model === backupModel
}

export function remainingKaiRequestMs(deadlineAt: number, capMs: number, now = Date.now()): number {
  if (!Number.isFinite(capMs)) return 0
  if (deadlineAt === Number.POSITIVE_INFINITY) return Math.max(0, Math.trunc(capMs))
  if (!Number.isFinite(deadlineAt)) return 0
  return Math.max(0, Math.min(Math.max(0, Math.trunc(capMs)), Math.trunc(deadlineAt - now)))
}
