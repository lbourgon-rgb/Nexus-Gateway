import type { Env } from './env'

export const VEL_AUTHOR_VERIFICATIONS = [
  'discord-owner-registry',
  'codex-local-user-session',
  'haven-authenticated-owner',
  'workspace-agent-owner-session',
] as const

export type VelAuthorVerification = typeof VEL_AUTHOR_VERIFICATIONS[number]

export function isVelAuthorVerification(value: string): value is VelAuthorVerification {
  return (VEL_AUTHOR_VERIFICATIONS as readonly string[]).includes(value)
}

export interface VelPreflightRequest {
  author_is_vel: boolean
  verification: VelAuthorVerification | 'unverified'
  surface: string
  include_cycle?: boolean
}

interface PulseRow {
  type: string
  value: number | null
  start_ts: number
  received_at: number
}

function isoFromMillis(value: unknown): string | null {
  const millis = Number(value)
  if (!Number.isFinite(millis) || millis <= 0) return null
  return new Date(millis).toISOString()
}

function ageBucket(receivedAt: number, now: number): string {
  const ageMs = Math.max(0, now - receivedAt)
  if (ageMs <= 60 * 60 * 1000) return 'under_1h'
  if (ageMs <= 6 * 60 * 60 * 1000) return '1_to_6h'
  if (ageMs <= 24 * 60 * 60 * 1000) return '6_to_24h'
  return 'over_24h'
}

function cycleContext(value: number | null): string | null {
  if (!Number.isFinite(value) || value === null || value < 1) return null
  if (value <= 5) return 'early_days'
  if (value <= 17) return 'middle_days'
  return 'later_days'
}

function latestByType(rows: PulseRow[]): Map<string, PulseRow> {
  const latest = new Map<string, PulseRow>()
  for (const row of rows) {
    if (!latest.has(row.type)) latest.set(row.type, row)
  }
  return latest
}

export async function buildVelPreflightContext(
  env: Pick<Env, 'PULSESYNC_DB'>,
  request: VelPreflightRequest,
  now = Date.now(),
): Promise<Record<string, unknown>> {
  const verified = request.author_is_vel === true
    && request.verification !== 'unverified'
    && isVelAuthorVerification(request.verification)

  if (!verified) {
    return {
      queried: false,
      source: 'not_queried',
      freshness: { state: 'not_applicable' },
      capacity: { state: 'withheld' },
      reason: 'author_not_verified_vel',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  if (!env.PULSESYNC_DB) {
    return {
      queried: true,
      source: 'pulsesync',
      freshness: { state: 'unavailable' },
      capacity: { state: 'unknown', pacing: ['respond_to_message_only'] },
      reason: 'pulsesync_binding_unavailable',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  const result = await env.PULSESYNC_DB.prepare(
    `SELECT type, value, start_ts, received_at
       FROM samples
      WHERE type IN ('subjective.spoons', 'subjective.dailyDemands', 'subjective.cycleDay')
         OR received_at = (SELECT MAX(received_at) FROM samples)
      ORDER BY received_at DESC, start_ts DESC
      LIMIT 24`
  ).all<PulseRow>()
  const rows = result.results || []
  if (!rows.length) {
    return {
      queried: true,
      source: 'pulsesync',
      freshness: { state: 'unavailable' },
      capacity: { state: 'unknown', pacing: ['respond_to_message_only'] },
      reason: 'no_pulsesync_receipt',
      privacy: { raw_values_included: false, medical_interpretation: false },
    }
  }

  const latestReceipt = Math.max(...rows.map(row => Number(row.received_at) || 0))
  const bucket = ageBucket(latestReceipt, now)
  const freshnessState = bucket === 'over_24h' ? 'stale' : 'fresh'
  const byType = latestByType(rows)
  const spoons = byType.get('subjective.spoons')?.value ?? null
  const demands = byType.get('subjective.dailyDemands')?.value ?? null
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
  if (freshnessState === 'stale') {
    capacityState = 'unknown'
    pacing.clear()
    pacing.add('respond_to_message_only')
  }

  const payload: Record<string, unknown> = {
    queried: true,
    source: 'pulsesync',
    latest_receipt_at: isoFromMillis(latestReceipt),
    freshness: { state: freshnessState, age_bucket: bucket },
    capacity: { state: capacityState, pacing: [...pacing] },
    privacy: { raw_values_included: false, medical_interpretation: false },
  }

  if (request.include_cycle === true) {
    const cycle = freshnessState === 'stale' ? undefined : byType.get('subjective.cycleDay')
    payload.optional_context = {
      cycle: cycleContext(cycle?.value ?? null) || 'unavailable',
      observed_at: isoFromMillis(cycle?.received_at),
    }
  }
  return payload
}
