import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const continuityTools = readFileSync(new URL('../src/tools/continuity.ts', import.meta.url), 'utf8');
const tahlTools = readFileSync(new URL('../src/tools/tahl.ts', import.meta.url), 'utf8');
const velastraTools = readFileSync(new URL('../src/tools/velastrahq.ts', import.meta.url), 'utf8');
const serythraeTools = readFileSync(new URL('../src/tools/serythrae.ts', import.meta.url), 'utf8');
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
