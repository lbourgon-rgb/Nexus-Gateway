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

test('Kai runner context loads identity, soul, skills, and canon search before composition', () => {
  for (const expected of [
    "'nesteq_identity'",
    "'nestsoul_read'",
    "'hearth_eq_state'",
    "'nesteq_surface'",
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
  assert.match(nexusIndex, /function imageReferenceUrls\(body: Record<string, unknown>, envelope: KaiDiscordEnvelope\): string\[\]/);
  assert.match(nexusIndex, /const attachmentUrls = envelope\.attachments/);
  assert.match(nexusIndex, /\.filter\(isImageAttachment\)/);
  assert.match(nexusIndex, /\.map\(attachment => attachment\.url \|\| attachment\.proxy_url \|\| ''\)/);
  assert.match(nexusIndex, /async function savedImageReferenceUrls\(env: Env, body: Record<string, unknown>, prompt: string\): Promise<string\[\]>/);
  assert.match(nexusIndex, /callKaiMindTool\(env, 'kai_image_reference_list', \{ subject, limit: 2 \}\)/);
  assert.match(nexusIndex, /subjects\.add\('vel'\)/);
  assert.match(nexusIndex, /subjects\.add\('kai'\)/);
  assert.match(nexusIndex, /\.\.\.referenceUrls\.map\(url => \(\{ type: 'image_url', image_url: \{ url \} \}\)\)/);
  assert.match(nexusIndex, /modalities: \['image', 'text'\]/);
  assert.match(nexusIndex, /await storeKaiGeneratedImage\(env, url, prompt, model\)/);
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
    'kaisoryth_type_snapshot',
    'kaisoryth_consolidate',
    'kaisoryth_thalamus_pulse',
    'kaisoryth_thalamus_dream',
    'kaisoryth_hearth_eq_state',
  ]) {
    assert.ok(serythraeTools.includes(toolName), `missing ${toolName}`);
  }
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
