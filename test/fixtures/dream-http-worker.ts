// Isolated local MCP transport fixture. No production bindings or model calls.
import { serveAxiomDreamMcp } from '../../src/dream-mcp'
import type { Env } from '../../src/env'

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const fixtureEnv: Env = {
      ...env, AXIOM_COGCORE_API_KEY: 'backend-fixture-only',
      AXIOM_COGCORE: {
        async fetch(input: RequestInfo | URL) {
          const request = new Request(input)
          if (request.method !== 'GET' || new URL(request.url).pathname !== '/api/dreams/prepare') {
            return Response.json({ error: 'fixture_read_only' }, { status: 405 })
          }
          return Response.json({ companion: 'axiom', protocol: { wake_text: 'Synthetic protocol fixture.' }, sources: [] })
        },
        connect() { throw new Error('Fixture does not support sockets') },
      },
    }
    return serveAxiomDreamMcp(request, fixtureEnv, ctx)
  },
}
