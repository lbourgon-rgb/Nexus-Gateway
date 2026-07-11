import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';

let tempRoot;
let routing;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kai-model-routing-test-'));
  const source = await readFile(new URL('../src/kai-model-routing.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const modulePath = path.join(tempRoot, 'kai-model-routing.mjs');
  await writeFile(modulePath, output, 'utf8');
  routing = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
});

after(async () => rm(tempRoot, { recursive: true, force: true }));

test('Kai fallback is limited to reviewed availability, timeout, transport, and server failures', () => {
  for (const failure of [
    { status: 408, message: 'request timeout' },
    { status: 429, message: 'rate limited' },
    { status: 502, message: 'bad gateway' },
    { status: 503, message: 'provider unavailable' },
    { error_type: 'provider_overloaded', message: 'capacity' },
    { message: 'fetch failed: ECONNRESET' },
  ]) assert.equal(routing.qualifiesForKaiBackup(failure), true, JSON.stringify(failure));

  for (const failure of [
    { status: 401, message: 'unauthorized' },
    { status: 402, message: 'insufficient credits' },
    { status: 400, message: 'context validation failed' },
    { status: 403, message: 'moderation policy' },
    { message: 'empty output' },
    { message: 'tool error' },
    { message: 'model refusal' },
  ]) assert.equal(routing.qualifiesForKaiBackup(failure), false, JSON.stringify(failure));
});

test('HTTP and HTTP-200 provider errors are normalized before route selection', () => {
  assert.deepEqual(routing.openRouterFailureFromResponse(503, {
    error: { message: 'upstream unavailable', metadata: { error_type: 'provider_unavailable' } },
  }), { message: 'upstream unavailable', status: 503, error_type: 'provider_unavailable' });

  assert.deepEqual(routing.openRouterChoiceFailure({
    choices: [{ finish_reason: 'error', error: { message: 'provider overloaded', code: 503 } }],
  }), { message: 'provider overloaded', status: 503 });
  assert.equal(routing.openRouterChoiceFailure({ choices: [{ finish_reason: 'stop' }] }), null);
});

test('Grok backup is pinned to xAI with no provider or model fallback', () => {
  assert.deepEqual(routing.kaiBackupProviderPreferences(), {
    order: ['xai'],
    only: ['xai'],
    allow_fallbacks: false,
    require_parameters: true,
  });
  assert.equal(routing.kaiModelIsAllowed('z-ai/glm-5.2'), true);
  assert.equal(routing.kaiModelIsAllowed('x-ai/grok-4.5'), true);
  assert.equal(routing.kaiModelIsAllowed('anthropic/claude-anything'), false);
});

test('request deadline accounting caps every lane and reaches zero without underflow', () => {
  assert.equal(routing.remainingKaiRequestMs(10_000, 30_000, 1_000), 9_000);
  assert.equal(routing.remainingKaiRequestMs(50_000, 10_000, 1_000), 10_000);
  assert.equal(routing.remainingKaiRequestMs(1_000, 10_000, 1_001), 0);
});
