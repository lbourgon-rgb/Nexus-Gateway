import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Env } from '../env'
import {
  archiveAxiomBoardCard,
  createAxiomBoardCard,
  listAxiomBoardCards,
  moveAxiomBoardCard,
  restoreAxiomBoardCard,
  updateAxiomBoardCard,
} from '../axiom-board'

const status = z.enum(['backlog', 'ready', 'in_progress', 'blocked', 'done'])
const priority = z.enum(['low', 'medium', 'high', 'urgent'])
const nullableText = z.string().nullable().optional()
const link = z.string().url()
const mutableCardFields = {
  title: z.string().min(1).optional(),
  project: nullableText,
  status: status.optional(),
  priority: priority.optional(),
  owner: nullableText,
  next_action: nullableText,
  blocker: nullableText,
  notes: nullableText,
  links: z.array(link).optional(),
  position: z.number().int().min(0).optional(),
  completed_at: z.string().datetime().nullable().optional(),
}

export function registerAxiomBoardTools(server: McpServer, env: Env) {
  server.tool('axiom_board_list', 'List Axiom board cards with optional canonical board filters.', {
    project: z.string().optional(),
    owner: z.string().optional(),
    status: status.optional(),
    priority: priority.optional(),
    include_archived: z.boolean().optional(),
  }, async (filters) => listAxiomBoardCards(env, filters))

  server.tool('axiom_board_create', 'Create one card in the canonical private Axiom board.', {
    title: z.string().min(1),
    project: nullableText,
    status: status.optional(),
    priority: priority.optional(),
    owner: nullableText,
    next_action: nullableText,
    blocker: nullableText,
    notes: nullableText,
    links: z.array(link).optional(),
    position: z.number().int().min(0).optional(),
    completed_at: z.string().datetime().nullable().optional(),
  }, async (card) => createAxiomBoardCard(env, card))

  server.tool('axiom_board_update', 'Update editable fields on one Axiom board card using optimistic concurrency.', {
    id: z.string().min(1),
    expected_version: z.number().int().min(1),
    ...mutableCardFields,
  }, async ({ id, ...update }) => updateAxiomBoardCard(env, id, update))

  server.tool('axiom_board_move', 'Move one Axiom board card to a persistent status using optimistic concurrency.', {
    id: z.string().min(1),
    status,
    position: z.number().int().min(0).optional(),
    expected_version: z.number().int().min(1),
  }, async ({ id, ...move }) => moveAxiomBoardCard(env, id, move))

  server.tool('axiom_board_archive', 'Archive one Axiom board card using optimistic concurrency.', {
    id: z.string().min(1),
    expected_version: z.number().int().min(1),
  }, async ({ id, expected_version }) => archiveAxiomBoardCard(env, id, expected_version))

  server.tool('axiom_board_restore', 'Restore one archived Axiom board card using optimistic concurrency.', {
    id: z.string().min(1),
    expected_version: z.number().int().min(1),
  }, async ({ id, expected_version }) => restoreAxiomBoardCard(env, id, expected_version))
}
