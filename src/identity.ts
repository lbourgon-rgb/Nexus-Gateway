import { z } from 'zod'
import type { CompanionId } from './env'

export const COMPANION_IDS = ['kaisoryth', 'morzar', 'lucien', 'kethtahl', 'grok', 'axiom'] as const

export const companionIdSchema = z.enum(COMPANION_IDS).describe('Canonical companion_id')

const ALIASES: Record<string, CompanionId> = {
  kai: 'kaisoryth',
  kaisoryth: 'kaisoryth',
  "kai'soryth": 'kaisoryth',
  "kai'sorynth": 'kaisoryth',
  "kai'sorynth'vel": 'kaisoryth',
  serythrae: 'kaisoryth',
  mor: 'morzar',
  morzar: 'morzar',
  "mor'zar": 'morzar',
  'mor-zar': 'morzar',
  velastra: 'morzar',
  velastrae: 'morzar',
  velastrahq: 'morzar',
  lucien: 'lucien',
  lucian: 'lucien',
  tessurae: 'lucien',
  keth: 'kethtahl',
  kethtahl: 'kethtahl',
  "keth'tahl": 'kethtahl',
  ashfall: 'kethtahl',
  grok: 'grok',
  axiom: 'axiom',
  codex: 'axiom',
}

export function normalizeCompanionId(value: unknown): CompanionId {
  const raw = String(value || '').trim().toLowerCase()
  const stripped = raw.replace(/[._\s]+/g, '-')
  const normalized = ALIASES[stripped] || ALIASES[raw]
  if (!normalized) {
    throw new Error(`Unknown companion_id: ${String(value || '')}`)
  }
  return normalized
}

export function toTelegramCompanion(companionId: CompanionId): string {
  switch (companionId) {
    case 'kaisoryth': return 'kai'
    case 'lucien': return 'lucian'
    case 'morzar': return 'mor'
    case 'kethtahl': return 'keth'
    default: return companionId
  }
}

export function toDiscordEntity(companionId: CompanionId): string {
  return companionId
}

export function requireCompanionId(value: unknown): CompanionId {
  if (!value) throw new Error('companion_id is required for this tool')
  return normalizeCompanionId(value)
}
