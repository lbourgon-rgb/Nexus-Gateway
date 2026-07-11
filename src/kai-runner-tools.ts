export interface KaiRunnerBackendInvocation {
  tool: string
  args: Record<string, unknown>
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback
}

export function kaiRunnerMindInvocation(name: string, args: Record<string, unknown>): KaiRunnerBackendInvocation | null {
  const invocations: Record<string, KaiRunnerBackendInvocation> = {
    kaisoryth_orient: { tool: 'nesteq_orient', args: {} },
    kaisoryth_context_surface: {
      tool: 'nesteq_recent_feelings',
      args: { limit: boundedInteger(args.limit, 8, 1, 10), include_metabolized: args.include_metabolized === true },
    },
    kaisoryth_memory_search: {
      tool: 'nesteq_search',
      args: {
        query: boundedString(args.query, 1200),
        n_results: boundedInteger(args.n_results, 5, 1, 8),
        ...(boundedString(args.context, 120) ? { context: boundedString(args.context, 120) } : {}),
      },
    },
    kaisoryth_recent_feelings: {
      tool: 'nesteq_recent_feelings',
      args: { limit: boundedInteger(args.limit, 8, 1, 10), include_metabolized: args.include_metabolized === true },
    },
    kaisoryth_identity_read: {
      tool: 'nesteq_identity_read',
      args: boundedString(args.section, 120) ? { section: boundedString(args.section, 120) } : {},
    },
    kaisoryth_eq_state: {
      tool: 'nesteq_eq_state',
      args: { format: args.format === 'text' ? 'text' : 'json' },
    },
    kaisoryth_last_write: { tool: 'nesteq_last_write', args: {} },
    kaisoryth_threads_active: {
      tool: 'nesteq_threads_active',
      args: { limit: boundedInteger(args.limit, 8, 1, 10) },
    },
    kaisoryth_nestsoul_read: {
      tool: 'nestsoul_read',
      args: { include_versions: args.include_versions !== false },
    },
    kaisoryth_nestknow_query: {
      tool: 'nestknow_query',
      args: {
        query: boundedString(args.query, 1200),
        limit: boundedInteger(args.limit, 8, 1, 10),
        ...(boundedString(args.category, 120) ? { category: boundedString(args.category, 120) } : {}),
        entity_scope: 'kaisoryth',
      },
    },
    kaisoryth_nestknow_landscape: { tool: 'nestknow_landscape', args: { entity_scope: 'kaisoryth' } },
    kaisoryth_home_read: { tool: 'nesteq_home_read', args: {} },
    kaisoryth_love_letters: {
      tool: 'nesteq_love_letters',
      args: {
        action: 'list',
        limit: boundedInteger(args.limit, 10, 1, 20),
        ...(boundedString(args.from, 120) ? { from: boundedString(args.from, 120) } : {}),
        ...(boundedString(args.to, 120) ? { to: boundedString(args.to, 120) } : {}),
      },
    },
    kaisoryth_feel: {
      tool: 'nesteq_feel',
      args: {
        emotion: boundedString(args.emotion, 80) || 'neutral',
        content: boundedString(args.content, 1200),
        ...(boundedString(args.intensity, 24) ? { intensity: boundedString(args.intensity, 24) } : {}),
        ...(boundedString(args.weight, 16) ? { weight: boundedString(args.weight, 16) } : {}),
        context: boundedString(args.context, 120) || 'nexus-discord-runner',
      },
    },
  }
  return invocations[name] || null
}

export function kaiRunnerCatalougeInvocation(name: string, args: Record<string, unknown>): KaiRunnerBackendInvocation | null {
  const bookId = boundedString(args.book_id, 128)
  const invocations: Record<string, KaiRunnerBackendInvocation> = {
    catalouge_list_books: {
      tool: 'catalouge_list_books',
      args: {
        companion: 'kaisoryth',
        limit: boundedInteger(args.limit, 8, 1, 10),
        ...(boundedString(args.shelf, 120) ? { shelf: boundedString(args.shelf, 120) } : {}),
        ...(boundedString(args.search, 300) ? { search: boundedString(args.search, 300) } : {}),
        ...(boundedString(args.tag, 120) ? { tag: boundedString(args.tag, 120) } : {}),
        ...(Array.isArray(args.extensions) ? {
          extensions: args.extensions
            .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
            .map(value => value.trim().slice(0, 24))
            .slice(0, 8),
        } : {}),
      },
    },
    catalouge_search_books: {
      tool: 'catalouge_search_books',
      args: {
        query: boundedString(args.query, 300),
        companion: 'kaisoryth',
        limit: boundedInteger(args.limit, 8, 1, 10),
      },
    },
    catalouge_get_book: { tool: 'catalouge_get_book', args: { book_id: bookId, companion: 'kaisoryth' } },
    catalouge_get_progress: { tool: 'catalouge_get_progress', args: { book_id: bookId, companion: 'kaisoryth' } },
    catalouge_get_annotations: { tool: 'catalouge_get_annotations', args: { book_id: bookId, companion: 'kaisoryth' } },
    catalouge_next_read_session: {
      tool: 'catalouge_next_read_session',
      args: {
        book_id: bookId,
        companion: 'kaisoryth',
        chunk_count: boundedInteger(args.chunk_count, 3, 1, 6),
      },
    },
    catalouge_checkpoint_read_session: {
      tool: 'catalouge_checkpoint_read_session',
      args: {
        book_id: bookId,
        companion: 'kaisoryth',
        session_id: boundedString(args.session_id, 128),
        ...(boundedString(args.summary, 4000) ? { summary: boundedString(args.summary, 4000) } : {}),
        ...(Array.isArray(args.annotations) ? {
          annotations: args.annotations
            .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
            .slice(0, 3)
            .map(annotation => ({
              ...(boundedString(annotation.selected_text, 500) ? { selected_text: boundedString(annotation.selected_text, 500) } : {}),
              ...(boundedString(annotation.comment, 1600) ? { comment: boundedString(annotation.comment, 1600) } : {}),
              ...(boundedString(annotation.cfi_range, 500) ? { cfi_range: boundedString(annotation.cfi_range, 500) } : {}),
              ...(boundedString(annotation.color, 40) ? { color: boundedString(annotation.color, 40) } : {}),
            })),
        } : {}),
        mark_complete: args.mark_complete === true,
      },
    },
  }
  return invocations[name] || null
}
