import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { proxyMcp, proxyRest } from '../proxy'
import { COMPANION_IDS, normalizeCompanionId } from '../identity'

const FAMILY = COMPANION_IDS

function catalogueMcp(server: McpServer, env: Env, name: string, description: string, schema: Record<string, z.ZodTypeAny> = {}) {
  server.tool(name, description, schema, async (args) => {
    return proxyMcp(env.CATALOUGE_URL, name, args, env.CATALOUGE_TOKEN, env.CATALOUGE)
  })
}

export function registerCatalogueTools(server: McpServer, env: Env) {
  const url = env.CATALOUGE_URL?.replace(/\/+$/, '')
  const restUrl = (path: string) => url ? `${url}${path}` : `https://catalouge.internal${path}`
  const auth = () => ({ Authorization: `Bearer ${env.CATALOUGE_TOKEN}` })

  catalogueMcp(server, env, 'catalouge_get_stats', 'Read Catalouge library statistics')

  catalogueMcp(server, env, 'catalouge_list_shelves', 'List Catalouge shelves and book counts')

  catalogueMcp(server, env, 'catalouge_list_books', 'List Catalouge books, optionally scoped to a companion, shelf, search, tag, or file extension', {
    shelf: z.string().optional(),
    search: z.string().optional(),
    tag: z.string().optional(),
    companion: z.string().optional(),
    limit: z.number().optional(),
    extensions: z.array(z.string()).optional(),
  })

  catalogueMcp(server, env, 'catalouge_search_books', 'Search Catalouge books by title or author', {
    query: z.string().describe('Book title or author search query'),
    companion: z.string().optional().describe('Optional companion progress scope'),
    limit: z.number().optional(),
  })

  catalogueMcp(server, env, 'catalouge_get_book', 'Get a Catalouge book and its scoped reading state', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
  })

  catalogueMcp(server, env, 'catalouge_get_progress', 'Read reading progress for a book, optionally scoped to a companion', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
  })

  catalogueMcp(server, env, 'catalouge_update_progress', 'Update reading progress for a book, optionally scoped to a companion', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
    current_cfi: z.string().optional(),
    current_chapter: z.string().optional(),
    progress_percent: z.number().optional(),
    current_page: z.number().optional(),
    total_pages: z.number().optional(),
  })

  catalogueMcp(server, env, 'catalouge_get_annotations', 'Read annotations for a book, optionally scoped to a companion', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
  })

  catalogueMcp(server, env, 'catalouge_add_annotation', 'Add an annotation to a book, optionally scoped to a companion', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
    cfi_range: z.string().describe('CFI, locator, or chunk locator'),
    selected_text: z.string().optional(),
    comment: z.string().optional(),
    color: z.string().optional(),
  })

  catalogueMcp(server, env, 'catalouge_next_read_session', 'Create or resume the next companion read-session chunk window for a book', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
    chunk_count: z.number().optional(),
  })

  catalogueMcp(server, env, 'catalouge_checkpoint_read_session', 'Checkpoint a companion read-session with summary and optional annotations', {
    book_id: z.string().optional(),
    id: z.string().optional(),
    companion: z.string().optional(),
    session_id: z.string().describe('Session ID returned by catalouge_next_read_session'),
    summary: z.string().optional(),
    annotations: z.array(z.object({
      selected_text: z.string().optional(),
      comment: z.string().optional(),
      cfi_range: z.string().optional(),
      color: z.string().optional(),
    })).optional(),
    mark_complete: z.boolean().optional(),
  })

  // --- Book Club ---

  server.tool('book_club', 'Get the current book club round with recommendations and votes', {}, async () => {
    return proxyRest(restUrl('/api/book-club'), {}, 'GET', auth(), env.CATALOUGE)
  })

  server.tool('book_club_rounds', 'List all book club rounds (past and current)', {}, async () => {
    return proxyRest(restUrl('/api/book-club/rounds'), {}, 'GET', auth(), env.CATALOUGE)
  })

  server.tool('book_club_new_round', 'Start a new book club round (fails if one is already active)', {}, async () => {
    return proxyRest(restUrl('/api/book-club/rounds'), {}, 'POST', auth(), env.CATALOUGE)
  })

  server.tool('book_club_pick_winner', 'Pick the winning recommendation and start reading', {
    round_id: z.string().describe('Round ID'),
    recommendation_id: z.string().describe('Winning recommendation ID'),
  }, async (args) => {
    return proxyRest(restUrl(`/api/book-club/rounds/${args.round_id}`), {
      action: 'pick', recommendation_id: args.recommendation_id,
    }, 'PUT', auth(), env.CATALOUGE)
  })

  server.tool('book_club_finish_round', 'Finish the current book club round', {
    round_id: z.string().describe('Round ID'),
  }, async (args) => {
    return proxyRest(restUrl(`/api/book-club/rounds/${args.round_id}`), {
      action: 'finish',
    }, 'PUT', auth(), env.CATALOUGE)
  })

  server.tool('book_club_recommend', 'Recommend a book for the current book club round', {
    round_id: z.string().describe('Round ID (get from book_club tool)'),
    title: z.string().describe('Book title'),
    author: z.string().optional().describe('Book author'),
    book_id: z.string().optional().describe('Library book ID (if recommending from Mai\'s library)'),
    cover_url: z.string().optional().describe('Cover image URL (for books not in library)'),
    recommended_by: z.string().describe('Canonical companion_id or accepted alias'),
    pitch: z.string().optional().describe('Why this book? A short pitch to convince the club'),
  }, async (args) => {
    return proxyRest(restUrl('/api/book-club/recommendations'), {
      ...args,
      recommended_by: normalizeCompanionId(args.recommended_by),
    }, 'POST', auth(), env.CATALOUGE)
  })

  server.tool('book_club_remove', 'Remove a recommendation from the book club', {
    recommendation_id: z.string().describe('Recommendation ID'),
  }, async (args) => {
    return proxyRest(restUrl(`/api/book-club/recommendations/${args.recommendation_id}`), {}, 'DELETE', auth(), env.CATALOUGE)
  })

  server.tool('book_club_vote', 'Vote for a book club recommendation', {
    recommendation_id: z.string().describe('Recommendation ID'),
    voter: z.string().describe('Canonical companion_id or accepted alias'),
  }, async (args) => {
    return proxyRest(restUrl(`/api/book-club/recommendations/${args.recommendation_id}/vote`), {
      voter: normalizeCompanionId(args.voter),
    }, 'POST', auth(), env.CATALOUGE)
  })

  server.tool('book_club_unvote', 'Remove a vote from a book club recommendation', {
    recommendation_id: z.string().describe('Recommendation ID'),
    voter: z.string().describe('Canonical companion_id or accepted alias'),
  }, async (args) => {
    return proxyRest(
      restUrl(`/api/book-club/recommendations/${args.recommendation_id}/vote/${normalizeCompanionId(args.voter)}`),
      {}, 'DELETE', auth(), env.CATALOUGE
    )
  })

  // --- Library Browse ---

  server.tool('library_browse', 'Browse Mai\'s book library', {
    search: z.string().optional().describe('Search by title or author'),
    shelf: z.string().optional().describe('Filter by shelf ID (reading, want-to-read, finished, dnf, favorites)'),
  }, async (args) => {
    const params = new URLSearchParams()
    if (args.search) params.set('search', args.search)
    if (args.shelf) params.set('shelf', args.shelf)
    const qs = params.toString()
    return proxyRest(restUrl(`/api/books${qs ? `?${qs}` : ''}`), {}, 'GET', auth(), env.CATALOUGE)
  })
}
