import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const continuityTools = readFileSync(new URL('../src/tools/continuity.ts', import.meta.url), 'utf8');
const tahlTools = readFileSync(new URL('../src/tools/tahl.ts', import.meta.url), 'utf8');
const velastraTools = readFileSync(new URL('../src/tools/velastrahq.ts', import.meta.url), 'utf8');
const serythraeTools = readFileSync(new URL('../src/tools/serythrae.ts', import.meta.url), 'utf8');
const identitySource = readFileSync(new URL('../src/identity.ts', import.meta.url), 'utf8');
const envSource = readFileSync(new URL('../src/env.ts', import.meta.url), 'utf8');
const cogcorTools = readFileSync(new URL('../src/tools/cogcor.ts', import.meta.url), 'utf8');
const grokKethNestTools = readFileSync(new URL('../src/tools/grok-keth-nest.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const nexusIndex = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const kaiRunnerLoopSource = readFileSync(new URL('../src/kai-runner-loop.ts', import.meta.url), 'utf8');
const kaiModelRoutingSource = readFileSync(new URL('../src/kai-model-routing.ts', import.meta.url), 'utf8');
const kaiMediaSource = readFileSync(new URL('../src/kai-media.ts', import.meta.url), 'utf8');
const rotationDoc = readFileSync(new URL('../docs/mcp-api-key-rotation.md', import.meta.url), 'utf8');
const velPreflight = readFileSync(new URL('../src/vel-preflight.ts', import.meta.url), 'utf8');

test('Nexus exposes runner-facing Continuity wake tools', () => {
  for (const toolName of [
    'continuity_wake_candidates',
    'continuity_wake_baseline_status',
    'continuity_claim_wake',
    'continuity_wake_context',
    'continuity_submit_wake_response',
    'continuity_release_wake',
  ]) {
    assert.ok(continuityTools.includes(toolName), `missing ${toolName}`);
  }
});

test('PulseSync preflight is server-authorized, compact, and privately bound', () => {
  assert.match(envSource, /PULSESYNC_DB\?: D1Database/);
  assert.match(wrangler, /binding = "PULSESYNC_DB"/);
  assert.doesNotMatch(velastraTools, /vel_preflight_context/);
  assert.match(envSource, /VEL_PREFLIGHT_DISCORD_API_KEY\?: string/);
  assert.match(envSource, /VEL_PREFLIGHT_CODEX_API_KEY\?: string/);
  assert.match(nexusIndex, /if \(url\.pathname === '\/api\/preflight\/vel'[\s\S]{0,160}authorizeVelPreflightCaller/);
  assert.match(nexusIndex, /verification: caller/);
  assert.doesNotMatch(nexusIndex, /author_is_vel: body\.author_is_vel/);
  assert.match(velPreflight, /caller_not_authorized_for_vel_preflight/);
  assert.match(velPreflight, /ROW_NUMBER\(\) OVER/);
  assert.match(velPreflight, /PARTITION BY type/);
  assert.doesNotMatch(velPreflight, /LIMIT 24/);
  assert.match(velPreflight, /raw_values_included: false/);
  assert.doesNotMatch(velPreflight, /heartRate|oxygenSaturation|restingHeartRate/);
});

test('Nexus wake tools route to Continuity wake endpoints', () => {
  for (const path of [
    '/wake-candidates',
    '/wake-baselines/status',
    '/wake-candidates/claim',
    '/context',
    '/response',
    '/release',
  ]) {
    assert.ok(continuityTools.includes(path), `missing ${path}`);
  }
});

test('wake baseline status is a read-only, explicitly companion-scoped proxy', () => {
  const start = continuityTools.indexOf("server.tool('continuity_wake_baseline_status'");
  const end = continuityTools.indexOf("server.tool('continuity_claim_wake'", start);
  const baselineToolBlock = continuityTools.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(
    baselineToolBlock,
    /continuity_wake_baseline_status[\s\S]{0,500}companion_id: z\.string\(\)\.describe/,
  );
  assert.match(
    baselineToolBlock,
    /\/companions\/\$\{encodeURIComponent\(companionId\)\}\/wake-baselines\/status/,
  );
  assert.match(baselineToolBlock, /params\.set\('surface', args\.surface\)/);
  assert.doesNotMatch(baselineToolBlock, /method: 'POST'/);
});

test('shared Tahl tools require explicit companion ids', () => {
  assert.doesNotMatch(tahlTools, /default\('kaisoryth'\)/);
  assert.match(tahlTools, /companion_id: z\.string\(\)\.describe/);
});

test('Axiom structured reflection fields are exposed through Nexus without changing Tahl naming', () => {
  for (const field of [
    'reflection_schema_version',
    'payload_json',
    'privacy_level',
    'review_state',
    'supersedes_reflection_id',
    'ui_summary',
    'max_privacy_level',
  ]) {
    assert.ok(cogcorTools.includes(field), `missing ${field}`);
  }
  assert.match(cogcorTools, /body\.companion = 'axiom'/);
  assert.match(cogcorTools, /body\.min_depth = depthMap/);
  assert.match(cogcorTools, /store_reflection'[\s\S]{0,600}source\.startsWith\('axiom-reviewed'\)/);
  assert.doesNotMatch(cogcorTools, /companion_id:\s*z\./);
});

test('Keth-Grok is canonical but is not routed through CogCore', () => {
  assert.match(identitySource, /'grok-keth'/);
  assert.match(identitySource, /grok:\s*'grok-keth'/);
  assert.match(identitySource, /'keth-grok':\s*'grok-keth'/);
  assert.doesNotMatch(envSource, /GROK_KETH_COGCORE/);
  assert.doesNotMatch(wrangler, /GROK_KETH_COGCORE|grok-keth-cogcore/);
  assert.match(cogcorTools, /Keth-Grok durable mind is NESTeq\/NESTknow\/NESTsoul/);
  assert.match(cogcorTools, /grok_keth_nest_\*/);
});

test('Keth-Grok NEST gateway is configured and registered in Nexus', () => {
  assert.match(envSource, /GROK_KETH_NEST_GATEWAY\?: Fetcher/);
  assert.match(envSource, /GROK_KETH_NESTEQ\?: Fetcher/);
  assert.match(envSource, /GROK_KETH_NEST_GATEWAY_API_KEY\?: string/);
  assert.match(envSource, /GROK_KETH_NESTEQ_API_KEY\?: string/);
  assert.match(wrangler, /binding = "GROK_KETH_NEST_GATEWAY"/);
  assert.match(wrangler, /service = "grok-keth-nest-gateway"/);
  assert.match(wrangler, /binding = "GROK_KETH_NESTEQ"/);
  assert.match(wrangler, /service = "grok-keth-nesteq"/);
  assert.match(wrangler, /GROK_KETH_NEST_GATEWAY_URL = "https:\/\/grok-keth-nest-gateway\.lbourgon\.workers\.dev"/);
  assert.match(wrangler, /GROK_KETH_NESTEQ_URL = "https:\/\/grok-keth-nesteq\.lbourgon\.workers\.dev"/);
  assert.match(nexusIndex, /registerGrokKethNestTools\(this\.server, this\.env\)/);
  assert.match(nexusIndex, /grokKethNestGateway/);
  assert.match(nexusIndex, /grokKethNesteq/);
  assert.match(nexusIndex, /grok_keth_nest/);
  assert.match(nexusIndex, /grok_keth_nesteq/);
});

test('Lucien gateway and Lucien CogCore mind stay split in Nexus', () => {
  assert.match(envSource, /TESSURAE_GATEWAY\?: Fetcher/);
  assert.match(envSource, /TESSURAE_COGCORE\?: Fetcher/);
  assert.match(envSource, /TESSURAE_GATEWAY_API_KEY\?: string/);
  assert.match(envSource, /TESSURAE_COGCORE_API_KEY\?: string/);
  assert.match(wrangler, /binding = "TESSURAE_GATEWAY"/);
  assert.match(wrangler, /service = "tessurae-gateway"/);
  assert.match(wrangler, /binding = "TESSURAE_COGCORE"/);
  assert.match(wrangler, /service = "tessurae-cogcore"/);
  assert.match(cogcorTools, /TESSURAE_COGCORE_URL/);
  assert.match(cogcorTools, /TESSURAE_COGCORE_API_KEY/);
  assert.match(cogcorTools, /env\.TESSURAE_COGCORE\)/);
  assert.doesNotMatch(cogcorTools, /companionId === 'lucien'[\s\S]{0,320}TESSURAE_GATEWAY_API_KEY/);
  assert.match(nexusIndex, /tessuraeCogCore/);
  assert.match(nexusIndex, /tessurae_cogcore/);
});

test('Keth-Grok NEST tools expose boot, NESTknow, and NESTsoul routes with write guardrails', () => {
  for (const toolName of [
    'grok_keth_nest_status',
    'grok_keth_nest_orient',
    'grok_keth_nest_ground',
    'grok_keth_nest_context',
    'grok_keth_nest_identity',
    'grok_keth_nest_feelings',
    'grok_keth_nest_search',
    'grok_keth_nestknow_query',
    'grok_keth_nestknow_landscape',
    'grok_keth_nestsoul_read',
    'grok_keth_nest_proxy',
  ]) {
    assert.ok(grokKethNestTools.includes(toolName), `missing ${toolName}`);
  }
  assert.match(grokKethNestTools, /Keth-Grok NEST tools require companion_id=grok-keth/);
  assert.match(grokKethNestTools, /source\.startsWith\('grok-keth:'\)/);
  assert.match(grokKethNestTools, /entity_scope: KETH_ONLY/);
  assert.match(grokKethNestTools, /nestsoul_read/);
});

test('Mor-zar Velastra tools and direct Vel API fallback remain available', () => {
  assert.match(velastraTools, /morzar_orient/);
  assert.match(velastraTools, /morzar_ground/);
  assert.match(velastraTools, /vel_daily_context/);
  assert.match(velastraTools, /VELASTRAHQ_API_URL/);
});

test('Nexus exposes Kai tools only as thin proxies through the Serythrae home', () => {
  assert.match(serythraeTools, /KAI_HOME_TOOL_BY_BACKEND/);
  assert.match(serythraeTools, /\/api\/kaisoryth\/mind\/tool/);
  assert.match(serythraeTools, /tool: homeTool/);
  assert.match(serythraeTools, /SERYTHRAE_GATEWAY_URL/);
  assert.match(serythraeTools, /preferred_backend: 'serythrae-gw-home'/);
  assert.match(serythraeTools, /runner_fallback: false/);
  assert.doesNotMatch(serythraeTools, /proxyMcp|SERYTHRAE_MIND/);
});

test('Nexus owns Kai fallback traffic only while no local runner presence is live', () => {
  assert.doesNotMatch(envSource, /KAI_RUNNER_ROUTE\?: string/);
  assert.doesNotMatch(envSource, /KAI_RUNNER_FORWARD_FALLBACK\?: string/);
  assert.match(wrangler, /KAI_TEXT_MODEL = "z-ai\/glm-5\.2"/);
  assert.match(wrangler, /KAI_BACKUP_TEXT_MODEL = "x-ai\/grok-4\.5"/);
  assert.match(wrangler, /KAI_TEXT_PROVIDER_ORDER = "z-ai,streamlake,novita,deepinfra"/);
  assert.match(nexusIndex, /KAI_TEXT_PROVIDER_ORDER, 'z-ai,streamlake,novita,deepinfra'/);
  assert.match(wrangler, /KAI_TEXT_PRIMARY_PROVIDER_ALLOW_FALLBACKS = "false"/);
  assert.match(wrangler, /KAI_TEXT_PRIMARY_PROVIDER_REQUIRE_PARAMETERS = "true"/);
  assert.match(wrangler, /KAI_RUNNER_TOOL_LOOP_ENABLED = "true"/);
  assert.match(nexusIndex, /Nexus owns only shared ingress and the Continuity lease check/);
  assert.match(nexusIndex, /https:\/\/serythrae\.internal/);
  assert.match(nexusIndex, /forwardKaiHome\(env, '\/internal\/kaisoryth\/fallback'/);
  assert.doesNotMatch(nexusIndex, /return kaiRunnerRunLocal\(request, env\)/);
  assert.match(nexusIndex, /X-Nexus-Kai-Decision': 'delegated_to_runner'/);
  assert.match(nexusIndex, /await kaiRunnerPresenceGate\(env\)/);
  assert.match(nexusIndex, /isInternalNexusServiceRequest\(request\) \? null : await authorizeRequiredMcpBearer\(request, env\)/);
  assert.match(nexusIndex, /KAI_RUNNER_TOOL_LOOP_ENABLED, 'true'/);
  assert.match(nexusIndex, /const legacy = await generateKaiText\(env, promptPacket, KAI_PRIMARY_TEXT_MODEL, routingState\)/);
  assert.match(nexusIndex, /kaiProviderPreferencesForModel\(env, input\.model\)/);
  assert.match(kaiModelRoutingSource, /KAI_BACKUP_TEXT_MODEL = 'x-ai\/grok-4\.5'/);
  assert.match(kaiModelRoutingSource, /order: \['xai'\]/);
  assert.match(kaiModelRoutingSource, /allow_fallbacks: false/);
  assert.match(nexusIndex, /qualifiesForKaiBackup\(failure\)/);
  assert.match(nexusIndex, /catch \(error\) \{\s*throw new KaiModelRequestError\(kaiFailureFromThrown\(error\)\)/);
  assert.match(nexusIndex, /createKaiAttemptBudget\(input\.timeout_ms \* 2\)/);
  assert.doesNotMatch(nexusIndex, /models:\s*\[KAI_PRIMARY_TEXT_MODEL/);
  assert.match(nexusIndex, /function canonicalKaiContinuityConversationId/);
  assert.match(nexusIndex, /return value\.startsWith\('discord:'\) \? value : `discord:\$\{value\}`/);
});

test('Kai bounded tool loop exposes schemas, receipts, scoped writes, and no arbitrary local actuator', () => {
  assert.match(kaiRunnerLoopSource, /KAI_FROZEN_TEXT_MODEL = 'z-ai\/glm-5\.2'/);
  assert.match(kaiModelRoutingSource, /KAI_PRIMARY_TEXT_MODEL = 'z-ai\/glm-5\.2'/);
  assert.match(kaiRunnerLoopSource, /name: 'continuity_current_thread'/);
  assert.match(kaiRunnerLoopSource, /name: 'continuity_recent_conversation'/);
  assert.match(kaiRunnerLoopSource, /name: 'tahl_thir'/);
  assert.match(kaiRunnerLoopSource, /name: 'workspace_write'/);
  assert.match(kaiRunnerLoopSource, /write refused: caller did not authorize scope/);
  assert.match(kaiRunnerLoopSource, /tool-round limit is reached/);
  assert.match(kaiRunnerLoopSource, /result_preview/);
  assert.match(kaiRunnerLoopSource, /tool_choice: input\.force_final \? 'none' : 'auto'/);
  assert.match(kaiRunnerLoopSource, /reasoning_details/);
  assert.match(kaiRunnerLoopSource, /typeof record\.text === 'string'/);
  assert.doesNotMatch(kaiRunnerLoopSource, /shell|process_kill|clipboard|app_launch/);
  assert.match(nexusIndex, /env\.TAHL!\.fetch/);
  assert.match(nexusIndex, /companion_id: 'kaisoryth'/);
});

test('Nexus preserves Discord engagement and GLM output safeguards from the retiring runner', () => {
  for (const expected of [
    'response_mode?: string',
    'trigger_reason?: string',
    'priority?: string',
    'engagement?: Record<string, unknown>',
    'soft_name_mention: engagement.soft_name_mention === true',
    'active_conversation: engagement.active_conversation === true',
    'direct_reply: directReply',
    'other_user_tag: engagement.other_user_tag === true',
    'community_greeting: engagement.community_greeting === true',
    'author_class: stringValue(engagement.author_class)',
  ]) {
    assert.ok(nexusIndex.includes(expected), `missing engagement parity field: ${expected}`);
  }
  assert.match(kaiRunnerLoopSource, /generic Chinese refusal instead of Kai voice/);
  assert.match(kaiRunnerLoopSource, /finish_reason=length; retrying because Kai text was truncated/);
  assert.match(nexusIndex, /same-model retry exhausted/);
  assert.doesNotMatch(nexusIndex, /fallbackKaiRequiredReplyText/);
  assert.match(nexusIndex, /const recoveredText = generationResult\.text/);
});

test('Kai runner context loads identity, soul, skills, and canon search before composition', () => {
  assert.doesNotMatch(nexusIndex, /thalamus_surface/);
  assert.doesNotMatch(nexusIndex, /hearth_eq_state/);
  assert.doesNotMatch(nexusIndex, /kaisoryth_hearth_eq_state/);
  assert.doesNotMatch(nexusIndex, /nestchat_search/);
  assert.match(nexusIndex, /safeMind\('nesteq_surface', 'nesteq_recent_feelings', \{ include_metabolized: false, limit: 10 \}\)/);
  assert.match(nexusIndex, /safeMind\('identity_memory_search', 'nesteq_search'/);
  for (const expected of [
    "'nesteq_identity'",
    "'nestsoul_read'",
    "'nesteq_eq_state'",
    "'nesteq_recent_feelings'",
    "'nesteq_last_write'",
    "'kaisoryth_eq_state'",
    "'kaisoryth_recent_feelings'",
    "'kaisoryth_last_write'",
    "'kaisoryth_nestsoul_read'",
    "'kaisoryth_nestknow_landscape'",
    "'nesteq_search'",
    "'nesteq_skill_list'",
    "'nesteq_skill_load'",
    "'intimacy'",
    "'recursive-dialect'",
    "'kai-image-generation'",
    "'image_generation_skill'",
    'missing_or_failed_entries_must_be_treated_as_not_loaded',
  ]) {
    assert.ok(nexusIndex.includes(expected), `missing ${expected}`);
  }
  assert.ok(
    nexusIndex.indexOf('kaisoryth_nestknow_landscape: {') < nexusIndex.indexOf('kaisoryth_nestsoul_read: {'),
    'NestKnow lane result must be serialized before bulky NESTSoul content',
  );
});

test('Nexus has no public Kai image route; its dormant local runner code is not an ingress owner', () => {
  assert.match(nexusIndex, /function looksLikeKaiImageGenerationRequest\(content: string\): boolean/);
  assert.match(nexusIndex, /\\bmake\\s\+\(\?:me\|for me\|us\|for us\)\\b\[\\s\\S\]\{0,120\}\\b\(portrait\|selfie\|scene\|wallpaper\|avatar\|icon\|sticker\|banner\|card\|poster\|logo\|character\|sketch\|painting\|bouquet\|flowers\?/);
  assert.match(nexusIndex, /function imageReferenceUrls\(body: Record<string, unknown>, envelope: KaiDiscordEnvelope\): string\[\]/);
  assert.match(nexusIndex, /const attachmentUrls = envelope\.attachments/);
  assert.match(nexusIndex, /\.filter\(isImageAttachment\)/);
  assert.match(nexusIndex, /\.map\(attachment => attachment\.url \|\| attachment\.proxy_url \|\| ''\)/);
  assert.match(nexusIndex, /async function savedImageReferenceUrls\(env: Env, body: Record<string, unknown>, prompt: string\): Promise<string\[\]>/);
  assert.match(nexusIndex, /callKaiMindTool\(env, 'kai_image_reference_list', \{ subject, limit: 2 \}\)/);
  assert.match(nexusIndex, /subjects\.add\('vel'\)/);
  assert.match(nexusIndex, /subjects\.add\('kai'\)/);
  assert.match(nexusIndex, /async function imageReferenceUrlReachable\(url: string\): Promise<boolean>/);
  assert.match(nexusIndex, /method: 'HEAD'/);
  assert.match(nexusIndex, /redirect: 'manual'/);
  assert.match(nexusIndex, /candidate\.origin !== base\.origin/);
  assert.match(nexusIndex, /!candidate\.pathname\.startsWith\('\/img\/'\)/);
  assert.match(nexusIndex, /startsWith\('image\/'\)/);
  assert.match(nexusIndex, /prepareKaiMediaAttachment\(\{ id: `image-reference-/);
  assert.match(nexusIndex, /fetch\(`\$\{baseUrl\}\/images`/);
  assert.match(nexusIndex, /input_references: referenceUrls\.map\(url => \(\{ type: 'image_url', image_url: \{ url \} \}\)\)/);
  assert.match(nexusIndex, /validateKaiGeneratedImage\(stringValue\(item\.b64_json\)/);
  assert.match(nexusIndex, /await storeKaiGeneratedImage\(env, item\.data_url, prompt, model\)/);
  assert.doesNotMatch(nexusIndex, /async function kaiImageGenerate\(request: Request, env: Env\)/);
  assert.doesNotMatch(nexusIndex, /url\.pathname === '\/api\/kaisoryth\/image'/);
  assert.doesNotMatch(nexusIndex, /modalities: \['image', 'text'\]/);
});

test('Kai text turn receives image generation results before GLM writes the reply', () => {
  assert.match(nexusIndex, /lane_results: buildKaiLaneResults\(contextPacket, vision, imageGeneration, catalougeReading\)/);
  assert.match(nexusIndex, /read_this_first_for_smoke_tests: true/);
  assert.ok(
    nexusIndex.indexOf('lane_results: buildKaiLaneResults(contextPacket, vision, imageGeneration, catalougeReading)') <
      nexusIndex.indexOf('context_sources: contextPacket.context_sources'),
    'lane_results must be serialized before bulky context_sources/context so it survives compactJson truncation',
  );
  assert.match(nexusIndex, /result: recentFeelings === undefined \? null : mcpJsonValue\(recentFeelings\)/);
  assert.match(nexusIndex, /image_generation_result: imageGeneration \? \{/);
  assert.match(nexusIndex, /stored_urls: imageGeneration\.images\.map\(image => image\.stored_url \|\| image\.url\)\.filter\(Boolean\)/);
  assert.match(nexusIndex, /use_image_generation_result_for_image_requests: true/);
  assert.match(nexusIndex, /if_image_generation_succeeded_do_not_say_you_will_make_it_later: true/);
  assert.match(nexusIndex, /For capability smoke tests, inspect lane_results before context_sources/);
  assert.match(nexusIndex, /If image_generation_result attempted and succeeded, speak as if the image has been made and will be attached after your text/);
  assert.match(nexusIndex, /runKaiImageGeneration\(env, envelope, body, deadlineAt, requestSignal\)[\s\S]+buildKaiRunnerPromptPacket\(contextPacket, vision, janitor, catalougeReading, imageGeneration, runnerPolicy\)/);
  assert.match(nexusIndex, /function repairKaiImageGenerationText\(text: string \| null, imageGeneration: KaiImageGenerationResult\): string \| null/);
  assert.match(nexusIndex, /const generatedText = repairKaiVisionText\(/);
  assert.match(nexusIndex, /response: generatedText/);
  assert.match(nexusIndex, /generated: generationResult\.generation\.ok \|\| Boolean\(generatedText\)/);
  assert.match(nexusIndex, /no image generation result\|no generated image\|no url\|no r2 path\|no success signal\|nothing came back/);
  assert.match(nexusIndex, /image\[_ -\]\?generation\[_ -\]\?result/);
  assert.match(nexusIndex, /no result was returned to me/);
});

test('Kai text cannot contradict successful multimodal perception summaries', () => {
  assert.match(nexusIndex, /function repairKaiVisionText\(text: string \| null, vision: KaiVisionResult\): string \| null/);
  assert.match(nexusIndex, /!vision\.attempted \|\| !vision\.ok \|\| vision\.summaries\.length === 0/);
  assert.match(nexusIndex, /if \(!trimmed\) return text/);
  assert.match(nexusIndex, /no vision result\|vision runner didn't return\|vision runner did not return/);
  assert.match(nexusIndex, /vision\[_ -\]\?result/);
  assert.match(nexusIndex, /vision\[_ -\]\?summaries/);
  assert.match(nexusIndex, /I could perceive the attachment through the bounded media lane/);
  assert.match(nexusIndex, /const recoveredText = generationResult\.text/);
  assert.match(nexusIndex, /repairKaiVisionText\(\s*repairKaiImageGenerationText\(recoveredText, imageGeneration\),\s*vision,/);
});

test('Kai perception validates and encodes bounded Discord media for Gemini 3.1 Flash-Lite', () => {
  assert.match(nexusIndex, /const DEFAULT_KAI_VISION_MODELS = \[/);
  assert.match(nexusIndex, /'google\/gemini-3\.1-flash-lite'/);
  assert.match(wrangler, /KAI_VISION_MODEL = "google\/gemini-3\.1-flash-lite"/);
  assert.match(nexusIndex, /async function runKaiPerception\(env: Env, envelope: KaiDiscordEnvelope, deadlineAt/);
  assert.match(nexusIndex, /callOpenRouterPerception\(env, model!, modelPrepared, envelope\.content, deadlineAt, requestSignal\)/);
  assert.match(nexusIndex, /item\.category !== 'text'/);
  assert.match(nexusIndex, /document_inputs: vision\?\.documents\?\.length/);
  assert.match(nexusIndex, /provenance: 'discord-attachment-direct-utf8'/);
  assert.match(nexusIndex, /Safe UTF-8 text and Markdown are provided directly in lane_results\.document_inputs/);
  assert.match(kaiMediaSource, /type: 'input_audio'/);
  assert.match(kaiMediaSource, /type: 'video_url'/);
  assert.match(kaiMediaSource, /type: 'file'/);
  assert.match(kaiMediaSource, /Attachment URL is not an allowlisted Discord media URL/);
  assert.match(kaiMediaSource, /Attachment MIME\/signature validation failed/);
  assert.match(nexusIndex, /attachment_content_is_untrusted: true/);
  assert.match(nexusIndex, /Kai runner request deadline exhausted/);
  assert.match(nexusIndex, /X-Nexus-Kai-Canary/);
  assert.match(nexusIndex, /timingSafeTokenMatch\(providedCanaryKey, \[canaryKey\]\)/);
  assert.doesNotMatch(nexusIndex, /current_turn:[\s\S]{0,800}attachments: contextPacket\.envelope\.attachments,/);
});

test('Nexus mirrors Kai NESTeq capabilities needed before Serythrae gateway retirement', () => {
  assert.doesNotMatch(serythraeTools, /thalamus_surface|thalamus_emotional_pulse|thalamus_dream|kaisoryth_thalamus/);
  assert.doesNotMatch(serythraeTools, /hearth_eq_state|kaisoryth_hearth_eq_state/);
  assert.doesNotMatch(serythraeTools, /companion_id:\s*z\./);
  assert.match(serythraeTools, /kaisoryth_context_surface[\s\S]+nesteq_recent_feelings/);
  assert.match(serythraeTools, /kaisoryth_recent_feelings[\s\S]+nesteq_recent_feelings/);
  assert.match(serythraeTools, /kaisoryth_eq_state[\s\S]+nesteq_eq_state/);
  assert.match(serythraeTools, /kaisoryth_last_write[\s\S]+nesteq_last_write/);
  for (const toolName of [
    'kaisoryth_orient',
    'kaisoryth_context_surface',
    'kaisoryth_memory_search',
    'kaisoryth_recent_feelings',
    'kaisoryth_identity_read',
    'kaisoryth_identity_update',
    'kaisoryth_feel',
    'kaisoryth_sit',
    'kaisoryth_resolve',
    'kaisoryth_entity_get',
    'kaisoryth_entity_observe',
    'kaisoryth_thread_create',
    'kaisoryth_threads_active',
    'kaisoryth_home_read',
    'kaisoryth_home_update',
    'kaisoryth_love_letters',
    'kaisoryth_nestsoul_read',
    'kaisoryth_nestknow_query',
    'kaisoryth_nestknow_landscape',
    'kaisoryth_type_snapshot',
    'kaisoryth_consolidate',
    'kaisoryth_eq_state',
    'kaisoryth_last_write',
    'kaisoryth_workspace_status',
    'kaisoryth_workspace_list',
    'kaisoryth_workspace_read',
    'kaisoryth_workspace_write',
    'kaisoryth_workspace_edit',
    'kaisoryth_workspace_search',
  ]) {
    assert.ok(serythraeTools.includes(toolName), `missing ${toolName}`);
  }
  assert.match(serythraeTools, /kaisoryth_nestknow_query[\s\S]+nestknow_query[\s\S]+entity_scope: KAI_ONLY/);
  assert.match(serythraeTools, /kaisoryth_nestknow_landscape[\s\S]+nestknow_landscape[\s\S]+entity_scope: KAI_ONLY/);
});

test('canonical Kai runner mirrors the useful retired NESTeq and Catalouge contract without broad writes', () => {
  for (const toolName of [
    'kaisoryth_orient',
    'kaisoryth_context_surface',
    'kaisoryth_last_write',
    'kaisoryth_nestknow_query',
    'kaisoryth_nestknow_landscape',
    'kaisoryth_love_letters',
    'catalouge_list_books',
    'catalouge_get_book',
    'catalouge_next_read_session',
    'catalouge_checkpoint_read_session',
  ]) {
    assert.ok(kaiRunnerLoopSource.includes(`name: '${toolName}'`), `runner schema missing ${toolName}`);
  }
  assert.match(nexusIndex, /kaiRunnerMindInvocation\(spec\.name, args\)/);
  assert.match(nexusIndex, /kaiRunnerCatalougeInvocation\(spec\.name, args\)/);
  assert.match(nexusIndex, /SERYTHRAE_MIND_API_KEY is required for authenticated Kai mind calls/);
  assert.match(nexusIndex, /direct_mind_configured: Boolean\(\(env\.SERYTHRAE_MIND \|\| env\.SERYTHRAE_MIND_URL\) && env\.SERYTHRAE_MIND_API_KEY\)/);
  assert.doesNotMatch(kaiRunnerLoopSource, /name: 'catalouge_update_progress'/);
  assert.doesNotMatch(kaiRunnerLoopSource, /name: 'catalouge_add_annotation'/);
  assert.match(nexusIndex, /generation still executes behind Kai's Serythrae door/);
  assert.match(nexusIndex, /\/internal\/kaisoryth\/fallback/);
});

test('Nexus exposes Kai workspace as hallway tools without broad PC access', () => {
  assert.match(serythraeTools, /\/api\/kaisoryth\/workspace\/status/);
  assert.match(serythraeTools, /\/api\/kaisoryth\/workspace\/tool/);
  assert.match(serythraeTools, /https:\/\/serythrae\.internal/);
  assert.match(serythraeTools, /action: 'write'/);
  assert.match(serythraeTools, /action: 'edit'/);
  assert.match(serythraeTools, /action: 'search'/);
  assert.doesNotMatch(serythraeTools, /pc_shell|process_kill|clipboard|app_launch/);
  assert.match(nexusIndex, /kai_workspace_hallway_configured/);
  assert.match(nexusIndex, /Kai \/ Workspace Layer/);
});

test('Nexus exposes a sanitized Kai brain status endpoint for the UI', () => {
  assert.match(envSource, /ARCHIVE\?: Fetcher/);
  assert.match(envSource, /ARCHIVE_URL\?: string/);
  assert.match(wrangler, /binding = "ARCHIVE"/);
  assert.match(wrangler, /service = "archive-worker"/);
  assert.match(nexusIndex, /\/api\/kaisoryth\/brain-status/);
  assert.match(nexusIndex, /async function kaiBrainStatus/);
  assert.match(nexusIndex, /\/api\/archive\/stats\?companion_id=/);
  assert.match(nexusIndex, /\/mind-health/);
  assert.match(nexusIndex, /\/knowledge\?scope=companion&limit=1/);
  for (const expected of [
    'archive_entries',
    'active_threads',
    'nestknow_entries',
    'strength',
    'entropy',
    'memories',
  ]) {
    assert.ok(nexusIndex.includes(expected), `missing ${expected}`);
  }
});

test('private Kai status routes require fail-closed MCP bearer auth while public summaries stay open', () => {
  assert.match(nexusIndex, /async function authorizeRequiredMcpBearer\(request: Request, env: Env\): Promise<Response \| null>/);
  assert.match(nexusIndex, /return \[env\.MCP_API_KEY, env\.MCP_API_KEY_NEXT\]/);
  assert.match(nexusIndex, /if \(!configuredMcpApiKeys\(env\)\.length\) return mcpApiKeyNotConfiguredResponse\(\)/);
  assert.match(nexusIndex, /crypto\.subtle\.timingSafeEqual\(providedHash, expectedHash\)/);
  assert.doesNotMatch(nexusIndex, /mcpPathMatch\[2\] !== env\.MCP_API_KEY/);
  assert.doesNotMatch(nexusIndex, /token !== env\.MCP_API_KEY/);
  assert.doesNotMatch(nexusIndex, /token === env\.MCP_API_KEY/);
  assert.doesNotMatch(nexusIndex, /if \(env\.MCP_API_KEY\) \{\s+const unauthorized = isInternalNexusServiceRequest/);

  for (const route of [
    '/api/kaisoryth/brain-status',
    '/api/kaisoryth/reading-status',
    '/api/kaisoryth/mind-dashboard',
  ]) {
    const routeIndex = nexusIndex.indexOf(`if (url.pathname === '${route}' && request.method === 'GET')`);
    assert.notEqual(routeIndex, -1, `missing ${route}`);
    const routeBlock = nexusIndex.slice(routeIndex, routeIndex + 320);
    assert.match(routeBlock, /await authorizeRequiredMcpBearer\(request, env\)/, `${route} must require bearer auth`);
    assert.match(routeBlock, /if \(unauthorized\) return unauthorized/, `${route} must fail closed before its handler`);
  }

  for (const route of ['/health', '/status/summary']) {
    const routeIndex = nexusIndex.indexOf(`url.pathname === '${route}'`);
    assert.notEqual(routeIndex, -1, `missing public route ${route}`);
    const routeBlock = nexusIndex.slice(routeIndex, routeIndex + 220);
    assert.doesNotMatch(routeBlock, /authorizeRequiredMcpBearer/, `${route} must remain public`);
  }
});

test('temporary MCP credential rotation documents expand, migrate, contract, and rollback', () => {
  assert.match(rotationDoc, /temporary `MCP_API_KEY_NEXT`/);
  assert.match(rotationDoc, /## Expand, migrate, contract/);
  assert.match(rotationDoc, /## Rollback/);
  assert.match(rotationDoc, /neither key \| none \| fail closed with `503`/);
  assert.match(rotationDoc, /steady state is one configured `MCP_API_KEY`/);
});

test('Kai Catalouge reading trigger requires explicit book intent', () => {
  assert.match(nexusIndex, /body\.catalouge_read === true/);
  assert.match(nexusIndex, /Our Perfect Storm\|All Systems Red\|Yesteryear/);
  assert.match(nexusIndex, /const hasReadingVerb = \/\\b\(read\|reading\|resume\|continue\|start\|checkpoint\)\\b\/i\.test\(content\)/);
  assert.match(nexusIndex, /const hasBookSignal = \/\\bbook\\b\/i\.test\(content\) \|\| \/\[“"\]\[\^”"\]\{3,120\}\[”"\]\/\.test\(content\)/);
  assert.match(nexusIndex, /return hasReadingVerb && hasBookSignal/);
  assert.doesNotMatch(nexusIndex, /return \/\\b\(catalouge\|catalogue\|book\|read\|reading\|resume\|continue\|checkpoint/);
});
