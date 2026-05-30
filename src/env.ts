export interface Env {
  MCP_OBJECT: DurableObjectNamespace
  CONTINUITY?: Fetcher
  DISCORD?: Fetcher
  TELEGRAM?: Fetcher
  TAHL?: Fetcher

  // Lbourgon backend URLs (set in wrangler.toml [vars])
  CONTINUITY_URL?: string
  DISCORD_URL?: string
  TELEGRAM_URL?: string
  HAVEN_URL?: string
  SERYTHRAE_GATEWAY_URL?: string
  TESSURAE_GATEWAY_URL?: string
  VELASTRAHQ_GATEWAY_URL?: string
  VELASTRAHQ_API_URL?: string
  SPOTIFY_URL?: string
  BIOMETRICS_URL?: string
  NANOBANANA_URL?: string
  VIDEO_URL?: string
  NOTION_URL?: string
  CATALOUGE_URL?: string
  LOVENSE_URL?: string

  // Secrets
  MCP_API_KEY?: string
  CONTINUITY_API_KEY?: string
  TESSURAE_GATEWAY_API_KEY?: string
  SERYTHRAE_GATEWAY_API_KEY?: string
  VELASTRAHQ_GATEWAY_API_KEY?: string
  CATALOUGE_TOKEN?: string
}

export type CompanionId = 'kaisoryth' | 'morzar' | 'lucien' | 'kethtahl' | 'grok' | 'codex'
