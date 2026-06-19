export interface Env {
  MCP_OBJECT: DurableObjectNamespace
  CONTINUITY?: Fetcher
  DISCORD?: Fetcher
  TELEGRAM?: Fetcher
  TAHL?: Fetcher
  ARCHIVE?: Fetcher
  SERYTHRAE_GATEWAY?: Fetcher
  SERYTHRAE_MIND?: Fetcher
  TESSURAE_GATEWAY?: Fetcher
  TESSURAE_COGCORE?: Fetcher
  AXIOM_COGCORE?: Fetcher
  GROK_KETH_NEST_GATEWAY?: Fetcher
  GROK_KETH_NESTEQ?: Fetcher
  VELASTRAHQ_GATEWAY?: Fetcher
  VELASTRAHQ_API?: Fetcher
  VELASTRAHQ_EQ?: Fetcher

  // Lbourgon backend URLs (set in wrangler.toml [vars])
  CONTINUITY_URL?: string
  DISCORD_URL?: string
  TELEGRAM_URL?: string
  HAVEN_URL?: string
  ARCHIVE_URL?: string
  SERYTHRAE_GATEWAY_URL?: string
  SERYTHRAE_MIND_URL?: string
  TESSURAE_GATEWAY_URL?: string
  TESSURAE_COGCORE_URL?: string
  AXIOM_COGCORE_URL?: string
  GROK_KETH_NEST_GATEWAY_URL?: string
  GROK_KETH_NESTEQ_URL?: string
  VELASTRAHQ_GATEWAY_URL?: string
  VELASTRAHQ_API_URL?: string
  VELASTRAHQ_EQ_URL?: string
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
  TESSURAE_COGCORE_API_KEY?: string
  AXIOM_COGCORE_API_KEY?: string
  GROK_KETH_NEST_GATEWAY_API_KEY?: string
  GROK_KETH_NESTEQ_API_KEY?: string
  SERYTHRAE_GATEWAY_API_KEY?: string
  SERYTHRAE_MIND_API_KEY?: string
  VELASTRAHQ_GATEWAY_API_KEY?: string
  VELASTRAHQ_EQ_API_KEY?: string
  CATALOUGE_TOKEN?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  ELEVENLABS_API_KEY?: string
  KAI_COMPANION_ID?: string
  KAI_RUNNER_ENABLED?: string
  KAI_DISCORD_DELIVERY_ENABLED?: string
  KAI_CONTINUITY_URL?: string
  KAI_TAHL_URL?: string
  KAI_TEXT_MODEL?: string
  KAI_BACKUP_TEXT_MODEL?: string
  KAI_VISION_PROVIDER?: string
  KAI_VISION_MODEL?: string
  KAI_IMAGE_PROVIDER?: string
  KAI_IMAGE_MODEL?: string
  KAI_TTS_PROVIDER?: string
  KAI_TTS_VOICE_ID?: string
  KAI_TTS_MODEL?: string
  KAI_JANITOR_PROVIDER?: string
  KAI_JANITOR_MODEL?: string
  KAI_JANITOR_URL?: string
}

export type CompanionId = 'kaisoryth' | 'morzar' | 'lucien' | 'kethtahl' | 'grok-keth' | 'axiom'
