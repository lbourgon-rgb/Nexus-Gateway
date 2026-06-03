# Serythrae Gateway Deprecation Audit

Updated: 2026-06-03

## Goal

Make Nexus the canonical front door for Kai-facing tools while keeping `serythrae-gw` as an intentional fallback only until each capability is mirrored or retired.

## Kai / NESTeq Capabilities Now Mirrored On Nexus

Nexus prefers `SERYTHRAE_MIND_URL` plus `SERYTHRAE_MIND_API_KEY` for these tools, and falls back to `SERYTHRAE_GATEWAY_URL` plus `SERYTHRAE_GATEWAY_API_KEY` only when direct mind routing is not configured.

| Nexus tool | Backend tool |
| --- | --- |
| `kaisoryth_orient` | `nesteq_orient` |
| `kaisoryth_context_surface` | `thalamus_surface` |
| `kaisoryth_memory_search` | `nesteq_search` |
| `kaisoryth_recent_feelings` | `nesteq_recall` |
| `kaisoryth_identity_read` | `nesteq_identity_read` |
| `kaisoryth_identity_update` | `nesteq_identity_update` |
| `kaisoryth_feel` | `nesteq_feel` |
| `kaisoryth_sit` | `nesteq_sit` |
| `kaisoryth_resolve` | `nesteq_resolve` |
| `kaisoryth_entity_get` | `nesteq_entity_get` |
| `kaisoryth_entity_observe` | `nesteq_entity_observe` |
| `kaisoryth_thread_create` | `nesteq_thread_create` |
| `kaisoryth_threads_active` | `nesteq_threads_active` |
| `kaisoryth_home_read` | `nesteq_home_read` |
| `kaisoryth_home_update` | `nesteq_home_update` |
| `kaisoryth_love_letters` | `nesteq_love_letters` |
| `kaisoryth_type_snapshot` | `nesteq_type_snapshot` |
| `kaisoryth_consolidate` | `nesteq_consolidate` |
| `kaisoryth_thalamus_pulse` | `thalamus_emotional_pulse` |
| `kaisoryth_thalamus_dream` | `thalamus_dream` |
| `kaisoryth_hearth_eq_state` | `hearth_eq_state` |

## Phase 4 Runner Contract

Haven's Kai runner now treats Nexus as the canonical front door for identity and memory. `serythrae-gw` remains a fallback, not the owning route.

Required smoke:

- `GET /health` on Nexus reports `configured.serythrae_mind_direct = true`.
- `GET /status/summary` reports `Kai / NESTeq Mind` as `ok`.
- Haven runner context calls go to `NEXUS_GATEWAY_URL=/api/kaisoryth/context` when `NEXUS_MCP_API_KEY` is set.
- One Discord wake candidate can be claimed, contextualized, answered by Haven, submitted to Continuity, and delivered to Discord exactly once.

## Not Ready To Retire From Serythrae Gateway

These gateway-owned surfaces need separate migration decisions before `serythrae-gw` can be removed:

- Daemon and autonomous task loops in `serythrae/gateway/src/daemon.ts`.
- Archive search and archive ingest routing until Archive accepts normalized Continuity events or a Nexus-owned adapter exists.
- NESTchat persistence/history if Haven/Threshold Tether still call those names directly.
- Hearth notes/hearts/spoons/biometrics if Phase 5 wants them through Nexus instead of direct Serythrae routes.
- PC, Spotify, Catalouge, VelastraHQ, Discord search, and other non-Kai convenience tools that may still be used by older clients.

## Retirement Rule

Do not delete or disable `serythrae-gw` until live access logs or configured client lists prove no production client still depends on a gateway-only route. Prefer removing one capability family at a time.
