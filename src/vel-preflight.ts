import type { Env } from './env'

export const VEL_AUTHOR_VERIFICATIONS = [
  'discord-owner-registry',
  'codex-local-user-session',
  'claude-local-user-session',
  'grok-local-user-session',
  'haven-authenticated-owner',
  'workspace-agent-owner-session',
] as const

export type VelAuthorVerification = typeof VEL_AUTHOR_VERIFICATIONS[number]

export function isVelAuthorVerification(value: string): value is VelAuthorVerification {
  return (VEL_AUTHOR_VERIFICATIONS as readonly string[]).includes(value)
}

export interface VelPreflightRequest {
  // This value must be derived from a server-owned caller credential. It is
  // deliberately not accepted from the public request body or an MCP tool.
  verification: VelAuthorVerification | null
  include_cycle?: boolean
}

interface PulseRow {
  type: string
  value: number | null
  start_ts: number | null
  received_at: number | null
}

interface Freshness {
  state: 'fresh' | 'stale' | 'unavailable'
  age_bucket?: string
  reason?: string
}

const LATEST_RECEIPT_MARKER = '__latest_receipt__'
const STALE_AFTER_MS = 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

function isoFromMillis(value: unknown): string | null {
  const millis = Number(value)
  if (!Number.isFinite(millis) || millis <= 0) return null
  return new Date(millis).toISOString()
}

function ageBucket(receivedAt: number, now: number): string {
  const ageMs = Math.max(0, now - receivedAt)
  if (ageMs <= 60 * 60 * 1000) return 'under_1h'
  if (ageMs <= 6 * 60 * 60 * 1000) return '1_to_6h'
  if (ageMs <= STALE_AFTER_MS) return '6_to_24h'
  return 'over_24h'
}

function timestampFreshness(value: unknown, now: number): Freshness {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { state: 'unavailable' }
  if (timestamp > now + MAX_FUTURE_SKEW_MS) return { state: 'unavailable', reason: 'future_timestamp' }
  const bucket = ageBucket(timestamp, now)
  return { state: bucket === 'over_24h' ? 'stale' : 'fresh', age_bucket: bucket }
}

function observationFreshness(row: PulseRow | undefined, now: number): Freshness {
  return timestampFreshness(row?.start_ts, now)
}

function cycleContext(value: number | null): string | null {
  if (!Number.isFinite(value) || value === null || value < 1) return null
  if (value <= 5) return 'early_days'
  if (value <= 17) return 'middle_days'
  return 'later_days'
}

function latestSubjectiveQuery(includeCycle: boolean): { sql: string; types: string[] } {
  const types = ['subjective.spoons', 'subjective.dailyDemands']
  if (includeCycle) types.push('subjective.cycleDay')
  const placeholders = types.map(() => '?').join(', ')
  return {
    types,
    sql: `WITH ranked AS (
      SELECT type, value, start_ts, received_at,
             ROW_NUMBER() OVER (
               PARTITION BY type
               ORDER BY start_ts DESC, received_at DESC, rowid DESC
             ) AS row_rank
        FROM samples
       WHERE type IN (${placeholders})
         AND start_ts <= ?
    )
    SELECT type, value, start_ts, received_at
      FROM ranked
     WHERE row_rank = 1
    UNION ALL
    SELECT '${LATEST_RECEIPT_MARKER}' AS type, NULL AS value, NULL AS start_ts,
           MAX(received_at) AS received_at
      FROM samples`,
  }
}

export async function buildVelPreflightContext(
  env: Pick<Env, 'PULSESYNC_DB'>,
  request: VelPreflightRequest,
  now = Date.now(),
): Promise<Record<string, any>> {
  if (!request.verification || !isVelAuthorVerification(request.verification)) {
    return {
      queried: false,
      source: 'not_queried',
      freshness: { state: 'not_applicable' },
      capacity: { state: 'withheld' },
      reason: 'caller_not_authorized_for_vel_preflight',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  if (!env.PULSESYNC_DB) {
    return {
      queried: true,
      source: 'pulsesync',
      verification: request.verification,
      freshness: { state: 'unavailable' },
      capacity: { state: 'unknown', pacing: ['respond_to_message_only'] },
      reason: 'pulsesync_binding_unavailable',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  const query = latestSubjectiveQuery(request.include_cycle === true)
  const result = await env.PULSESYNC_DB.prepare(query.sql)
    .bind(...query.types, now + MAX_FUTURE_SKEW_MS)
    .all<PulseRow>()
  const rows = result.results || []
  const latestReceiptRow = rows.find(row => row.type === LATEST_RECEIPT_MARKER)
  const latestReceipt = Number(latestReceiptRow?.received_at)
  if (!Number.isFinite(latestReceipt) || latestReceipt <= 0) {
    return {
      queried: true,
      source: 'pulsesync',
      verification: request.verification,
      freshness: { state: 'unavailable' },
      capacity: { state: 'unknown', pacing: ['respond_to_message_only'] },
      reason: 'no_pulsesync_receipt',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  const byType = new Map(rows.filter(row => row.type !== LATEST_RECEIPT_MARKER).map(row => [row.type, row]))
  const spoonsRow = byType.get('subjective.spoons')
  const demandsRow = byType.get('subjective.dailyDemands')
  const spoonsFreshness = observationFreshness(spoonsRow, now)
  const demandsFreshness = observationFreshness(demandsRow, now)
  const spoons = spoonsFreshness.state === 'fresh' ? spoonsRow?.value ?? null : null
  const demands = demandsFreshness.state === 'fresh' ? demandsRow?.value ?? null : null
  const pacing = new Set<string>()
  let capacityState = 'unknown'

  if (Number.isFinite(spoons)) {
    if ((spoons as number) <= 3) capacityState = 'low'
    else if ((spoons as number) <= 5) capacityState = 'limited'
    else capacityState = 'available'
  }
  if (capacityState === 'low') {
    pacing.add('gentle_pace')
    pacing.add('prefer_shorter_reply')
    pacing.add('reduce_decisions')
  } else if (capacityState === 'limited') {
    pacing.add('prefer_shorter_reply')
    pacing.add('one_decision_at_a_time')
  }
  if (Number.isFinite(demands) && (demands as number) >= 7) {
    pacing.add('reduce_decisions')
    pacing.add('avoid_optional_tasks')
  }
  if (!pacing.size) pacing.add('respond_to_message_only')

  const receiptFreshness = timestampFreshness(latestReceiptRow?.received_at, now)
  const payload: Record<string, any> = {
    queried: true,
    source: 'pulsesync',
    verification: request.verification,
    latest_receipt_at: isoFromMillis(latestReceipt),
    freshness: receiptFreshness,
    capacity: {
      state: capacityState,
      pacing: [...pacing],
      basis_freshness: {
        spoons: spoonsFreshness,
        daily_demands: demandsFreshness,
      },
    },
    privacy: { raw_values_included: false, medical_interpretation: false },
  }

  if (request.include_cycle === true) {
    const cycleRow = byType.get('subjective.cycleDay')
    const cycleFreshness = observationFreshness(cycleRow, now)
    payload.optional_context = {
      cycle: cycleFreshness.state === 'fresh' ? cycleContext(cycleRow?.value ?? null) || 'unavailable' : 'unavailable',
      freshness: cycleFreshness,
    }
  }
  return payload
}
