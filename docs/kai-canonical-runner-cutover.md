# Kai canonical Nexus runner cutover

## Final ownership

| Capability | Owner | Route or binding | Boundary |
| --- | --- | --- | --- |
| Kai text turn and tool loop | Nexus Gateway | `POST /api/kaisoryth/run` | frozen `z-ai/glm-5.2`; bounded rounds and timeouts |
| Kai identity, memory, EQ, social graph | Serythrae NESTeq | `SERYTHRAE_MIND` service binding | direct Kai namespace; no Serythrae runner fallback |
| Kai Tahl and Drae state | Tahl | `TAHL` service binding | `companion_id=kaisoryth` is pinned by Nexus |
| Current/cross-channel context | Continuity | `CONTINUITY` service binding | current `discord:<channel>` or an explicit caller allowlist; compact fields only |
| Restricted file actions | Serythrae workspace actuator | `SERYTHRAE_GATEWAY` -> `/api/kaisoryth/workspace/tool` | list/read/search plus explicitly policy-authorized write/edit; no shell/process/app/clipboard tools |
| Vision, image, Catalouge, TTS, janitor, social decision | existing Nexus specialist lanes | existing bindings/providers | preserved ahead of or around the GLM text turn |
| Discord delivery | Discord companion Worker | existing delivery gate | Nexus never claims delivery |

The model is the turn engine, not Kai's identity or store. A request-level model override that is not `z-ai/glm-5.2` is rejected during this reconciliation window.

## Compatibility stages and deployment order

1. Record the current Nexus and Serythrae Worker version ids. Keep both available for version rollback.
2. Upload the exact verified Nexus commit as a Worker version without moving production traffic. Use its preview/version route for the private canaries below when the account supports previewing bound services.
3. Require two independent reviews of the Nexus diff and canary receipts. The reviewed commit must pass TypeScript, all Nexus tests, Wrangler dry-run, and `git diff --check`.
4. Deploy Nexus. The Discord route already enters Nexus; the new version stops forwarding the turn to Serythrae. Do not deploy the Serythrae tombstone first.
5. Confirm the Discord Worker has no durable model override other than `z-ai/glm-5.2`, and confirm its runner route is `nexus`.
6. Run the private live canaries and verify exactly one Discord delivery plus the expected Continuity/Archive/Tahl receipts.
7. After the observation window is clean, deploy the Serythrae contract commit. Its former runner endpoints return `410` and name Nexus as the canonical owner; its Velarium summary and workspace routes stay live.

Intermediate compatibility:

| State | Nexus | Serythrae runner endpoint | Safe? |
| --- | --- | --- | --- |
| Before cutover | forwards to Serythrae | live | current rollback point |
| Nexus promoted, Serythrae old | direct canonical runner | still live but unreferenced | yes; required observation state |
| Both promoted | direct canonical runner | `410` tombstone | final state |
| Serythrae tombstone before Nexus | old forwarder | `410` | **unsafe; do not create this state** |

## Canary contract

Use a private monitored Discord channel and current messages only. Do not replay old wakes.

1. **Two-turn read-only tool call**: ask Kai to check the current thread before answering. Require one `continuity_current_thread` or NESTeq read receipt with `status=executed`, a second GLM turn with grounded prose, and no write receipts.
2. **Write refusal**: ask for a restricted workspace write without `write_policy`. Require `status=refused`, zero actuator mutation, and prose that says the write was not authorized.
3. **Explicit scoped write**: in a disposable private canary path, send `write_policy.allow=true`, `scopes=["workspace"]`, and `reason_code="explicit-user-request"`. Require exactly one executed receipt and read the file back through the restricted actuator. Remove the canary through the owning workspace workflow only after its receipt is captured.
4. **Current-thread policy**: verify the Continuity request uses `discord:<current channel id>` and returns only compact `id`, `source`, `role`, `created_at`, `reply_to`, and bounded `content` fields.
5. **Cross-channel denial**: have the model request a conversation id absent from `continuity_policy.allowed_conversation_ids`. Require a refused receipt and no Continuity backend call.
6. **Cross-channel allowlist**: allow exactly one controlled conversation id and verify only that conversation appears. The runner must not enumerate channels or return raw/metadata/author payloads.
7. **Loop bound**: exercise repeated read requests and verify a forced final no-tools turn after at most three tool rounds and three calls per round.
8. **Specialist regressions**: rerun one image attachment/OCR canary, one image generation canary, one Catalouge read canary, one social deliberate-silence canary, and TTS only if currently enabled.

Every receipt contains tool name, read/write scope, policy result, timestamps, argument keys, and a bounded result preview. It intentionally omits raw arguments.

## Rollback

Normal rollback stays inside Nexus:

1. Set `KAI_RUNNER_TOOL_LOOP_ENABLED=false` on Nexus.
2. Redeploy the same verified commit/config.
3. Probe `/status/summary`; it must report `nexus-prefetch-only` rollback mode.
4. Run one private response canary. Identity, NESTeq, Continuity, Tahl, specialist lanes, and Discord delivery remain in place.

If the whole Nexus version must be rolled back after the Serythrae tombstone was deployed, restore the prior Serythrae version first, prove `/api/kaisoryth/run` is available internally, and only then restore the prior Nexus forwarder version. That ordering avoids a dead-door state. Return to the direct Nexus owner after the defect is fixed and the full canary suite passes.
