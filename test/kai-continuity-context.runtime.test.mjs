import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';

let tempRoot;
let continuity;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kai-continuity-test-'));
  const source = await readFile(new URL('../src/kai-continuity-context.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const modulePath = path.join(tempRoot, 'kai-continuity-context.mjs');
  await writeFile(modulePath, output, 'utf8');
  continuity = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
});

after(async () => rm(tempRoot, { recursive: true, force: true }));

const event = (id, content, conversationId = 'discord:channel:thread') => ({
  id,
  conversation_id: conversationId,
  source: 'discord',
  role: 'user',
  created_at: '2026-07-12T23:00:00Z',
  content,
  private_metadata: 'must not cross the boundary',
});

test('Kai continuity preserves a complete Nitro-sized Discord message', () => {
  const content = 'x'.repeat(5_000);
  const result = continuity.compactKaiContinuityEvents({ events: [event('one', content)] }, 'discord:channel:thread', 10);
  assert.equal(result.events[0].content, content);
  assert.equal(result.events[0].content_length, 5_000);
  assert.equal(result.events[0].truncated, false);
  assert.equal(result.privacy.bounded_content_chars, 5_000);
  assert.equal('private_metadata' in result.events[0], false);
});

test('Kai continuity marks oversize and aggregate-budget truncation explicitly', () => {
  const result = continuity.compactKaiContinuityEvents({
    events: [
      event('one', 'a'.repeat(5_001)),
      event('two', 'b'.repeat(5_000)),
      event('three', 'c'.repeat(5_000)),
    ],
  }, 'discord:channel:thread', 10, 5_000, 8_000);
  assert.equal(result.events[0].content.length, 5_000);
  assert.equal(result.events[0].content_length, 5_001);
  assert.equal(result.events[0].truncated, true);
  assert.equal(result.events[1].content.length, 3_000);
  assert.equal(result.events[1].truncated, true);
  assert.equal(result.events[2].content.length, 0);
  assert.equal(result.events[2].truncated, true);
  assert.equal(result.privacy.bounded_total_content_chars, 8_000);
});

test('Kai continuity filters foreign conversations before applying the limit', () => {
  const result = continuity.compactKaiContinuityEvents({
    events: [event('foreign', 'wrong lane', 'discord:other'), event('right', 'right lane')],
  }, 'discord:channel:thread', 1);
  assert.equal(result.count, 1);
  assert.equal(result.events[0].id, 'right');
});
