# MCP API key rotation

Nexus supports a temporary `MCP_API_KEY_NEXT` Worker secret so callers can move to a new MCP credential without downtime. While it is configured, private Kai status routes, MCP/SSE bearer authentication, supported MCP/SSE URL-path authentication, and optional external Kai runner authentication accept either `MCP_API_KEY` or `MCP_API_KEY_NEXT`.

`MCP_API_KEY_NEXT` is a migration binding, not a permanent second credential. Store both values as Cloudflare Worker secrets; never put either value in `wrangler.toml`, logs, URLs captured by analytics, or repository files.

## Compatibility matrix

| Worker secrets | Accepted credentials | Required private routes |
| --- | --- | --- |
| `MCP_API_KEY` only | current | configured |
| both keys | current and next | configured |
| `MCP_API_KEY_NEXT` only | next | configured |
| neither key | none | fail closed with `503` |

The optional external Kai runner keeps its existing behavior: when neither key exists, it does not add an auth requirement; when either key exists, external requests must supply one of them. Requests made through the trusted `nexus.internal` service-binding hostname keep their existing bypass.

## Expand, migrate, contract

1. **Expand:** deploy the dual-key-capable Nexus version while `MCP_API_KEY` still contains the current credential. Add the new value with `npx wrangler secret put MCP_API_KEY_NEXT`. Verify both credentials against a private status route and each MCP/SSE transport used by callers.
2. **Migrate:** update server-side callers to send the next credential. Deploy and verify every caller before changing the primary secret. Do not place either credential in browser code.
3. **Contract:** after old-credential traffic has stopped, set `MCP_API_KEY` to the new value. Verify callers again, then remove the temporary binding with `npx wrangler secret delete MCP_API_KEY_NEXT`. The steady state is one configured `MCP_API_KEY`.

## Rollback

Before contract, roll callers back to the current credential; `MCP_API_KEY` remains valid throughout the expand and migrate phases. Removing `MCP_API_KEY_NEXT` is safe only after all callers use the current credential again.

After `MCP_API_KEY` has been changed to the new value, expand again before rolling back: put the old value into `MCP_API_KEY_NEXT`, verify both values, move callers back to the old value, set `MCP_API_KEY` to the old value, and finally delete `MCP_API_KEY_NEXT`.

Never delete or replace the only accepted credential before the corresponding callers have moved. A deployment with neither secret intentionally fails closed on required-auth routes.
