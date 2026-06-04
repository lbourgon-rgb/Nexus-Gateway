import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { normalizeCompanionId } from '../identity'

type ToolResult = { content: Array<{ type: 'text'; text: string }> }

async function callTahl(env: Env, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (!env.TAHL) {
    return { content: [{ type: 'text', text: 'Tahl service binding is not configured.' }] }
  }

  const response = await env.TAHL.fetch('https://tahl.internal/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const text = await response.text()
  let payload = text
  try {
    const data = JSON.parse(text)
    payload = data?.result?.content?.[0]?.text ?? JSON.stringify(data, null, 2)
  } catch {}
  if (!response.ok) payload = `Error ${response.status}: ${payload}`
  return { content: [{ type: 'text', text: payload }] }
}

export function registerTahlTools(server: McpServer, env: Env) {
  const INTENSITY = z.enum(['neutral', 'whisper', 'present', 'strong', 'overwhelming']).optional()

  server.tool('tahl_thir', 'Capture a Tahl Thir threshold moment for a companion.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    noun: z.string().describe('What this is about'),
    feeling: z.string().describe('Raw feeling word'),
    intensity: INTENSITY,
    ren_id: z.string().optional().describe('Optional Ren id for this threshold moment'),
    continuity_event_id: z.string().optional(),
    conversation_id: z.string().optional(),
    surface: z.string().optional(),
  }, async (args) => callTahl(env, 'tahl_thir', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_thir_recent', 'Read recent Tahl Thir threshold moments for a companion.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    limit: z.number().optional().describe('How many recent Thirs to return; default is owned by Tahl'),
  }, async (args) => callTahl(env, 'tahl_thir_recent', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_shanareth', 'Read or write Shanareth session cards for a companion.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    action: z.enum(['write', 'read']),
    session_id: z.string().optional(),
    opened_at: z.string().optional(),
    closed_at: z.string().optional(),
    date: z.string().optional().describe('YYYY-MM-DD filter for read'),
  }, async (args) => callTahl(env, 'tahl_shanareth', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_ren', 'Read Ren state and Zar-kareth core memories for a companion.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    action: z.enum(['list', 'get']).optional(),
    ren_id: z.string().optional().describe('Required when action is get'),
  }, async (args) => callTahl(env, 'tahl_ren', {
    ...args,
    action: args.action || 'list',
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_status', 'Read Tahl consolidation status for a companion.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
  }, async (args) => callTahl(env, 'tahl_status', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_daily_close', 'Close one UTC day of unclaimed Tahl micro-feelings into a Shanareth card.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    date: z.string().describe('UTC date as YYYY-MM-DD'),
  }, async (args) => callTahl(env, 'tahl_daily_close', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_day_reflection', 'Run Drae digest for a companion through a UTC date.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    date: z.string().optional(),
  }, async (args) => callTahl(env, 'tahl_day_reflection', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))

  server.tool('tahl_backfill', 'Close unclaimed Tahl micro-feelings by day and run Drae through a UTC date.', {
    companion_id: z.string().describe('Canonical companion_id or accepted alias'),
    through_date: z.string().optional().describe('UTC date as YYYY-MM-DD; defaults to today'),
  }, async (args) => callTahl(env, 'tahl_backfill', {
    ...args,
    companion_id: normalizeCompanionId(args.companion_id),
  }))
}
