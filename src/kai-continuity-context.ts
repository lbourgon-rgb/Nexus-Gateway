export const MAX_KAI_DISCORD_MESSAGE_CHARS = 5_000
export const MAX_KAI_CONTINUITY_CONTENT_CHARS = 20_000

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function boundedString(value: unknown, maxChars: number): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxChars)
    : undefined
}

export function compactKaiContinuityEvents(
  value: unknown,
  expectedConversationId: string,
  limit: number,
  perEventChars = MAX_KAI_DISCORD_MESSAGE_CHARS,
  totalContentChars = MAX_KAI_CONTINUITY_CONTENT_CHARS,
): Record<string, unknown> {
  const root = recordValue(value)
  const events = (Array.isArray(root.events) ? root.events : [])
    .map(item => recordValue(item))
    .filter(event => String(event.conversation_id || '') === expectedConversationId)
    .slice(0, limit)
  let remainingChars = Math.max(0, totalContentChars)

  return {
    conversation_id: expectedConversationId,
    count: events.length,
    events: events.map((event) => {
      const rawContent = typeof event.content === 'string' ? event.content.trim() : ''
      const allowedChars = Math.min(Math.max(0, perEventChars), remainingChars)
      const content = rawContent.slice(0, allowedChars)
      remainingChars -= content.length
      return {
        id: boundedString(event.id, 128) || null,
        source: boundedString(event.source, 32) || null,
        role: boundedString(event.role, 24) || null,
        created_at: boundedString(event.created_at, 64) || null,
        reply_to: boundedString(event.reply_to, 128) || null,
        content,
        content_length: rawContent.length,
        truncated: content.length < rawContent.length,
      }
    }),
    privacy: {
      raw_omitted: true,
      metadata_omitted: true,
      author_details_omitted: true,
      bounded_content_chars: Math.max(0, perEventChars),
      bounded_total_content_chars: Math.max(0, totalContentChars),
    },
  }
}
