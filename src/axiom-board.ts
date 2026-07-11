import type { Env } from './env'

export type AxiomBoardFilters = {
  project?: string
  owner?: string
  status?: string
  priority?: string
  include_archived?: boolean
}

type ToolResult = { content: Array<{ type: 'text'; text: string }> }

const AXIOM_BOARD_ORIGIN = 'https://axiom-cogcore.internal'

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

function boardPath(cardId: string, action?: 'archive' | 'restore'): string {
  const cardPath = `/api/board/cards/${encodeURIComponent(cardId)}`
  return action ? `${cardPath}/${action}` : cardPath
}

async function callAxiomBoard(
  env: Env,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
  filters?: AxiomBoardFilters,
): Promise<ToolResult> {
  if (!env.AXIOM_COGCORE) {
    return textResult('AXIOM_COGCORE service binding is not configured for Axiom board tools.')
  }
  if (!env.AXIOM_COGCORE_API_KEY) {
    return textResult('AXIOM_COGCORE_API_KEY is not configured for Axiom board tools.')
  }

  const url = new URL(path, AXIOM_BOARD_ORIGIN)
  if (filters) {
    if (filters.project) url.searchParams.set('project', filters.project)
    if (filters.owner) url.searchParams.set('owner', filters.owner)
    if (filters.status) url.searchParams.set('status', filters.status)
    if (filters.priority) url.searchParams.set('priority', filters.priority)
    if (filters.include_archived !== undefined) url.searchParams.set('include_archived', String(filters.include_archived))
  }

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${env.AXIOM_COGCORE_API_KEY}`,
  })
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  try {
    const response = await env.AXIOM_COGCORE.fetch(new Request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }))
    const responseText = await response.text()
    let rendered = responseText
    try {
      rendered = JSON.stringify(JSON.parse(responseText), null, 2)
    } catch {
      // Preserve a non-JSON upstream error body for diagnosis.
    }
    return response.ok ? textResult(rendered) : textResult(`Error ${response.status}: ${rendered}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return textResult(`Axiom board backend request failed: ${detail}`)
  }
}

export function listAxiomBoardCards(env: Env, filters: AxiomBoardFilters): Promise<ToolResult> {
  return callAxiomBoard(env, 'GET', '/api/board/cards', undefined, filters)
}

export function createAxiomBoardCard(env: Env, card: Record<string, unknown>): Promise<ToolResult> {
  return callAxiomBoard(env, 'POST', '/api/board/cards', { ...card, source: 'axiom-nexus-tool' })
}

export function updateAxiomBoardCard(
  env: Env,
  cardId: string,
  update: Record<string, unknown>,
): Promise<ToolResult> {
  return callAxiomBoard(env, 'PATCH', boardPath(cardId), update)
}

export function moveAxiomBoardCard(
  env: Env,
  cardId: string,
  move: Record<string, unknown>,
): Promise<ToolResult> {
  return callAxiomBoard(env, 'PATCH', boardPath(cardId), move)
}

export function archiveAxiomBoardCard(
  env: Env,
  cardId: string,
  expectedVersion: number,
): Promise<ToolResult> {
  return callAxiomBoard(env, 'POST', boardPath(cardId, 'archive'), { expected_version: expectedVersion })
}

export function restoreAxiomBoardCard(
  env: Env,
  cardId: string,
  expectedVersion: number,
): Promise<ToolResult> {
  return callAxiomBoard(env, 'POST', boardPath(cardId, 'restore'), { expected_version: expectedVersion })
}
