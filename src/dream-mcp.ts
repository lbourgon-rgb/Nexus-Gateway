import { createMcpHandler } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from './env'
import { authorizeAxiomDream, AXIOM_DREAM_MCP_PATH } from './dream-auth'
import { registerAxiomDreamTool } from './tools/dreams'

export async function serveAxiomDreamMcp(request: Request, env: Env, ctx: ExecutionContext) {
  const denied = await authorizeAxiomDream(request, env)
  if (denied) return denied
  // Per-request server: auth never leaks through a shared MCP session or DO props.
  // Claims and committed receipts live in CogCore, not transport/session memory.
  const server = new McpServer({ name: 'axiom-dreams', version: '1.0.0' })
  registerAxiomDreamTool(server, env)
  const response = await createMcpHandler(server, {
    route: AXIOM_DREAM_MCP_PATH, enableJsonResponse: true,
  })(request, env, ctx)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
