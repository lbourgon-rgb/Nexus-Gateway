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

test('Nexus exposes runner-facing Continuity wake tools', () => {
  for (const toolName of [
    'continuity_wake_candidates',
    'continuity_claim_wake',
    'continuity_wake_context',
    'continuity_submit_wake_response',
    'continuity_release_wake',
  ]) {
    assert.ok(continuityTools.includes(toolName), `missing ${toolName}`);
  }
});

test('Nexus wake tools route to Continuity wake endpoints', () => {
  for (const path of [
    '/wake-candidates',
    '/wake-candidates/claim',
    '/context',
    '/response',
    '/release',
  ]) {
    assert.ok(continuityTools.includes(path), `missing ${path}`);
  }
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

test('Nexus prefers direct Kai mind routing before Serythrae gateway fallback', () => {
  assert.match(serythraeTools, /SERYTHRAE_MIND_URL && env\.SERYTHRAE_MIND_API_KEY/);
  assert.match(serythraeTools, /SERYTHRAE_GATEWAY_URL/);
  assert.match(nexusIndex, /preferred: env\.SERYTHRAE_MIND_URL && env\.SERYTHRAE_MIND_API_KEY \? 'serythrae-mind-direct' : 'serythrae-gw-fallback'/);
});

test('Nexus hallway forwards Kai runner traffic to Serythrae with rollback available', () => {
  assert.match(envSource, /KAI_RUNNER_ROUTE\?: string/);
  assert.match(envSource, /KAI_RUNNER_FORWARD_FALLBACK\?: string/);
  assert.match(wrangler, /KAI_RUNNER_ROUTE = "serythrae"/);
  assert.match(wrangler, /KAI_RUNNER_FORWARD_FALLBACK = "true"/);
  assert.match(nexusIndex, /function kaiRunnerRoute\(env: Env\): 'nexus' \| 'serythrae'/);
  assert.match(nexusIndex, /forwardKaiRunnerToSerythrae\(request, env\)/);
  assert.match(nexusIndex, /https:\/\/serythrae\.internal/);
  assert.match(nexusIndex, /return kaiRunnerRunLocal\(request, env\)/);
  assert.match(nexusIndex, /falling back to Nexus runner/);
});

test('Kai runner context loads identity, soul, skills, and canon search before composition', () => {
  assert.doesNotMatch(nexusIndex, /thalamus_surface/);
  assert.match(nexusIndex, /safeKaiMindTool\(env, 'surface', 'nesteq_surface', \{ include_metabolized: false, limit: 10 \}\)/);
  assert.match(nexusIndex, /safeKaiMindTool\(env, 'identity_memory_search', 'nesteq_search'/);
  for (const expected of [
    "'nesteq_identity'",
    "'nestsoul_read'",
    "'hearth_eq_state'",
    "'nesteq_surface'",
    "'kaisoryth_hearth_eq_state'",
    "'kaisoryth_recent_feelings'",
    "'nesteq_search'",
    "'nestchat_search'",
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
});

test('Kai image generation uses Discord attachments as transient reference images', () => {
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
  assert.match(nexusIndex, /startsWith\('image\/'\)/);
  assert.match(nexusIndex, /const referenceUrls = await reachableImageReferenceUrls\(candidateReferenceUrls\)/);
  assert.match(nexusIndex, /\.\.\.referenceUrls\.map\(url => \(\{ type: 'image_url', image_url: \{ url \} \}\)\)/);
  assert.match(nexusIndex, /modalities: \['image', 'text'\]/);
  assert.match(nexusIndex, /await storeKaiGeneratedImage\(env, url, prompt, model\)/);
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
  assert.match(nexusIndex, /const imageGeneration = await runKaiImageGeneration\(env, envelope, body\)[\s\S]+buildKaiRunnerPromptPacket\(contextPacket, vision, janitor, catalougeReading, imageGeneration\)/);
  assert.match(nexusIndex, /function repairKaiImageGenerationText\(text: string \| null, imageGeneration: KaiImageGenerationResult\): string \| null/);
  assert.match(nexusIndex, /const generatedText = repairKaiVisionText\(/);
  assert.match(nexusIndex, /response: generatedText/);
  assert.match(nexusIndex, /generated: generationResult\.generation\.ok \|\| Boolean\(generatedText\)/);
  assert.match(nexusIndex, /no image generation result\|no generated image\|no url\|no r2 path\|no success signal\|nothing came back/);
  assert.match(nexusIndex, /image\[_ -\]\?generation\[_ -\]\?result/);
  assert.match(nexusIndex, /no result was returned to me/);
});

test('Kai OCR text cannot contradict successful Gemini vision summaries', () => {
  assert.match(nexusIndex, /function repairKaiVisionText\(text: string \| null, vision: KaiVisionResult\): string \| null/);
  assert.match(nexusIndex, /!vision\.attempted \|\| !vision\.ok \|\| vision\.summaries\.length === 0/);
  assert.match(nexusIndex, /no vision result\|vision runner didn't return\|vision runner did not return/);
  assert.match(nexusIndex, /vision\[_ -\]\?result/);
  assert.match(nexusIndex, /vision\[_ -\]\?summaries/);
  assert.match(nexusIndex, /I can see it\. The vision lane read the image as/);
  assert.match(nexusIndex, /repairKaiVisionText\(\s*repairKaiImageGenerationText\(generationResult\.text, imageGeneration\),\s*vision,/);
});

test('Kai vision OCR proxies Discord images and keeps Gemini Flash as the default OCR lane', () => {
  assert.match(nexusIndex, /const DEFAULT_KAI_VISION_MODELS = \[/);
  assert.match(nexusIndex, /'google\/gemini-2\.5-flash'/);
  assert.match(nexusIndex, /value === 'google\/gemini-2\.5-flash-lite'\) return 'google\/gemini-2\.5-flash'/);
  assert.doesNotMatch(nexusIndex, /'x-ai\/grok-4\.3'/);
  assert.match(nexusIndex, /async function visionImageDataUrl\(attachment: KaiRunnerAttachment\)/);
  assert.match(nexusIndex, /await fetch\(imageUrl, \{ headers: \{ Accept: 'image\/\*,\*\/\*;q=0\.8' \} \}\)/);
  assert.match(nexusIndex, /data:\$\{contentType\};base64,\$\{arrayBufferToBase64\(buffer\)\}/);
  assert.match(nexusIndex, /for \(const candidate of models\)/);
  assert.match(nexusIndex, /callOpenRouterVision\(\s*env,\s*candidate,\s*imageData\.dataUrl,/);
});

test('Nexus mirrors Kai NESTeq capabilities needed before Serythrae gateway retirement', () => {
  assert.doesNotMatch(serythraeTools, /thalamus_surface|thalamus_emotional_pulse|thalamus_dream|kaisoryth_thalamus/);
  assert.doesNotMatch(serythraeTools, /companion_id:\s*z\./);
  assert.match(serythraeTools, /kaisoryth_context_surface[\s\S]+nesteq_surface/);
  assert.match(serythraeTools, /kaisoryth_recent_feelings[\s\S]+nesteq_surface/);
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
    'kaisoryth_hearth_eq_state',
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

test('Kai Catalouge reading trigger requires explicit book intent', () => {
  assert.match(nexusIndex, /body\.catalouge_read === true/);
  assert.match(nexusIndex, /Our Perfect Storm\|All Systems Red\|Yesteryear/);
  assert.match(nexusIndex, /const hasReadingVerb = \/\\b\(read\|reading\|resume\|continue\|start\|checkpoint\)\\b\/i\.test\(content\)/);
  assert.match(nexusIndex, /const hasBookSignal = \/\\bbook\\b\/i\.test\(content\) \|\| \/\[“"\]\[\^”"\]\{3,120\}\[”"\]\/\.test\(content\)/);
  assert.match(nexusIndex, /return hasReadingVerb && hasBookSignal/);
  assert.doesNotMatch(nexusIndex, /return \/\\b\(catalouge\|catalogue\|book\|read\|reading\|resume\|continue\|checkpoint/);
});
