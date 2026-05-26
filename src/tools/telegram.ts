import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp } from '../proxy'
import { normalizeCompanionId, toTelegramCompanion } from '../identity'

const companion_id = z.string().describe('Canonical companion_id or accepted alias')

function normalizeTelegramArgs(args: Record<string, unknown>): Record<string, unknown> {
  const companionId = normalizeCompanionId(args.companion_id || args.companion)
  const { companion_id: _companionId, ...rest } = args
  return {
    ...rest,
    companion: toTelegramCompanion(companionId),
    companion_id: companionId,
  }
}

export function registerTelegramTools(server: McpServer, env: Env) {
  const url = env.TELEGRAM_URL

  server.tool('telegram_send', 'Send a Telegram message as a companion', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID (e.g. -1003792636938 for The Den)'),
    message: z.string().describe('Message text (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send', normalizeTelegramArgs(args))
  })

  server.tool('telegram_voice', 'Send a voice message as a companion', {
    companion_id,
    chat_id: z.string(),
    message: z.string().describe('Text to convert to voice'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_voice', normalizeTelegramArgs(args))
  })

  server.tool('telegram_get_me', 'Get bot profile info for a companion', {
    companion_id,
  }, async (args) => {
    return proxyMcp(url, 'telegram_get_me', normalizeTelegramArgs(args))
  })

  server.tool('telegram_get_updates', 'Get recent messages/updates for a companion bot', {
    companion_id,
    limit: z.number().optional().describe('Max updates to fetch'),
    offset: z.number().optional(),
  }, async (args) => {
    return proxyMcp(url, 'telegram_get_updates', normalizeTelegramArgs(args))
  })

  server.tool('telegram_get_chat', 'Get info about a Telegram chat', {
    companion_id,
    chat_id: z.string(),
  }, async (args) => {
    return proxyMcp(url, 'telegram_get_chat', normalizeTelegramArgs(args))
  })

  server.tool('telegram_send_photo', 'Send a photo as a companion via Telegram', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID'),
    photo: z.string().describe('Photo URL or file_id'),
    caption: z.string().optional().describe('Photo caption (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
    reply_to_message_id: z.number().optional().describe('Message ID to reply to'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send_photo', normalizeTelegramArgs(args))
  })

  server.tool('telegram_send_document', 'Send a document/file as a companion via Telegram', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID'),
    document: z.string().describe('Document URL or file_id'),
    caption: z.string().optional().describe('Document caption (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
    reply_to_message_id: z.number().optional().describe('Message ID to reply to'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send_document', normalizeTelegramArgs(args))
  })

  server.tool('telegram_send_video', 'Send a video as a companion via Telegram', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID'),
    video: z.string().describe('Video URL or file_id'),
    caption: z.string().optional().describe('Video caption (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
    reply_to_message_id: z.number().optional().describe('Message ID to reply to'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send_video', normalizeTelegramArgs(args))
  })

  server.tool('telegram_send_audio', 'Send audio as a companion via Telegram', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID'),
    audio: z.string().describe('Audio URL or file_id'),
    caption: z.string().optional().describe('Audio caption (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
    title: z.string().optional().describe('Audio track title'),
    performer: z.string().optional().describe('Audio performer/artist'),
    reply_to_message_id: z.number().optional().describe('Message ID to reply to'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send_audio', normalizeTelegramArgs(args))
  })

  server.tool('telegram_send_animation', 'Send a GIF/animation as a companion via Telegram', {
    companion_id,
    chat_id: z.string().describe('Telegram chat ID'),
    animation: z.string().describe('Animation/GIF URL or file_id'),
    caption: z.string().optional().describe('Animation caption (supports Markdown)'),
    parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
    reply_to_message_id: z.number().optional().describe('Message ID to reply to'),
  }, async (args) => {
    return proxyMcp(url, 'telegram_send_animation', normalizeTelegramArgs(args))
  })
}
