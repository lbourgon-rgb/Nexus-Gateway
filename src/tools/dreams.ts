import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../env'
import { callDream, dreamToolSchema } from '../dreams'

export function registerAxiomDreamTool(server: McpServer, env: Env) {
  server.registerTool('axiom_dream', {
    description: 'Axiom-only dream lifecycle. prepare returns the portable wake protocol and bounded own-lane sources. Claim one stable run_key before active-wake authorship. Commit only imagined dream material with provisional followups; never promote identity. After an ambiguous write, run_get the original run_key before retrying. No scheduler or model is invoked by this tool.',
    inputSchema: dreamToolSchema,
  }, async args => callDream(env, args))
}
