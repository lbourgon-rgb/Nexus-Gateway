# Axiom dream MCP boundary

This is an additive, inactive-until-configured author surface in `nexus-gateway`.
It does not register dream tools on the shared `/mcp` or `/sse` Nexus registry.
Existing connectors and wake tools are unchanged.

- Endpoint: `POST /mcp/dreams/axiom` (standard MCP Streamable HTTP, JSON responses).
- Authentication: `Authorization: Bearer <AXIOM_DREAM_MCP_API_KEY>` only.
- A missing scoped key, or a scoped key equal to `MCP_API_KEY` or `MCP_API_KEY_NEXT`, fails closed. Shared keys cannot use this route. No URL token or query parameters.
- Discovery: JSON-RPC `tools/list` returns only `axiom_dream`.
- No initialize/session is required for a direct JSON-RPC call; ordinary MCP initialize is also supported. Request-scoped MCP state is not dream state.
- Upstream: only the `AXIOM_COGCORE` service binding, with server-side `AXIOM_COGCORE_API_KEY`, to `/api/dreams`. No caller-selected companion, namespace, key, URL, or path.
- No model execution, scheduler, identity promotion, or cross-lane memory calls.

## Tool arguments

Call `axiom_dream` with a flat object. All action schemas are strict.

| action | Additional fields |
| --- | --- |
| `prepare` | none; returns bounded sources, coverage and the portable wake protocol |
| `claim` | `run_key`, `owner_id`, `policy_revision`, `identity_revision`, `source_refs`; optional `lease_seconds` |
| `heartbeat` | `run_id`, `owner_id`, `lease_epoch`; optional `lease_seconds` |
| `commit` | `run_id`, `owner_id`, `lease_epoch`, `title`, `summary`, `content`, `context`, `author_provenance`, `followups` |
| `run_get` | `run_key` |
| `get` | `dream_id` |
| `list` | optional `limit` (1–50), `cursor` (opaque from preceding page) |

Run keys match `[a-zA-Z0-9][a-zA-Z0-9:._-]{0,159}`. Claims accept at most eight source references (`kind`: reflection/journal/feeling and UUID `id`). Leases are 60–900 seconds. Commit provenance is `{author:"axiom",runtime,model,method:"active-wake-thalamus"}`. Sources are frozen by the backend at claim; commits cannot replace them. Followups (at most five) have `kind` question/reflection_candidate/action_suggestion, `content`, and optional `next_review_at`. They are proposals, not execution or accepted intentions.

After an ambiguous write, use `run_get` with the original run key before retrying or composing again. The adapter makes one upstream request, never an automatic write retry. A backend lane mismatch returns no private upstream body. Backend errors remain MCP `isError:true`; transport failure marks mutation outcome unknown. Redirects are not followed.

## Portable wake and activation gates

Read the canonical identity/policy in the current runtime, then `prepare` and its returned protocol. Claim one authorized stable run key, compose in the awake companion, commit with the current lease, and read back. This route does not supply a replacement identity or model. A fresh wake must retrieve its actual identity separately; repository paths alone are not a cloud-runtime capability.

Deployment, scoped-secret provisioning, connector setup (if needed), and a real authored pilot are separate operator gates. Adding this route does not make a new tool appear in an already configured shared Nexus connector. A local authorized runtime can use the dedicated HTTP route directly; cloud connectors require their own explicit setup. Never put a key in a prompt, URL, tracked file, or log.

## Local validation

`node --test test/dreams.runtime.test.mjs test/dream-auth.runtime.test.mjs`

For actual Workers transport behavior, start the isolated synthetic fixture:

```powershell
node node_modules/wrangler/bin/wrangler.js dev --local --config test/fixtures/dream-http.wrangler.toml --port 18841 --ip 127.0.0.1
```

In another shell, run `$env:DREAM_HTTP_FIXTURE='1'; node --test test/dream-http.test.mjs`.
The fixture has no production bindings and accepts only a synthetic read-only `prepare`; no dream is generated or saved.
