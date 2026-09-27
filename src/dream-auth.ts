import type { Env } from './env'

export const AXIOM_DREAM_MCP_PATH = '/mcp/dreams/axiom'

async function sameToken(left: string, right: string) {
  const encode = new TextEncoder()
  const [a, b] = await Promise.all([left, right].map(value => crypto.subtle.digest('SHA-256', encode.encode(value))))
  const aa = new Uint8Array(a), bb = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]
  return diff === 0
}

export async function authorizeAxiomDream(request: Request, env: Env): Promise<Response | null> {
  const deny = (status: number, error: string) => Response.json({ error }, {
    status, headers: { 'Cache-Control': 'no-store' },
  })
  const scoped = env.AXIOM_DREAM_MCP_API_KEY
  const shared = [env.MCP_API_KEY, env.MCP_API_KEY_NEXT].filter((key): key is string => Boolean(key))
  if (!scoped || (await Promise.all(shared.map(key => sameToken(scoped, key)))).some(Boolean)) {
    return deny(503, 'axiom_dream_auth_not_configured')
  }
  // Bearer only: no URL credential, caller companion, or shared Nexus fallback.
  const auth = request.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !await sameToken(token, scoped)) return deny(401, 'axiom_dream_unauthorized')
  if (new URL(request.url).search) return deny(400, 'axiom_dream_query_not_allowed')
  return null
}
