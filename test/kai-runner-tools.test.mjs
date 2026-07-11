import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';

let tempRoot;
let tools;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kai-runner-tools-test-'));
  const source = await readFile(new URL('../src/kai-runner-tools.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const modulePath = path.join(tempRoot, 'kai-runner-tools.mjs');
  await writeFile(modulePath, output, 'utf8');
  tools = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

test('NESTeq invocation mapping preserves private ownership and read-only love letters', () => {
  assert.deepEqual(tools.kaiRunnerMindInvocation('kaisoryth_orient', {}), { tool: 'nesteq_orient', args: {} });
  assert.deepEqual(tools.kaiRunnerMindInvocation('kaisoryth_last_write', {}), { tool: 'nesteq_last_write', args: {} });
  assert.deepEqual(tools.kaiRunnerMindInvocation('kaisoryth_nestknow_query', {
    query: 'fixture', limit: 99, category: 'canon', entity_scope: 'other',
  }), {
    tool: 'nestknow_query',
    args: { query: 'fixture', limit: 10, category: 'canon', entity_scope: 'kaisoryth' },
  });
  assert.deepEqual(tools.kaiRunnerMindInvocation('kaisoryth_love_letters', {
    action: 'send', body: 'must not forward', limit: 99, from: 'Vel', to: 'Kai',
  }), {
    tool: 'nesteq_love_letters',
    args: { action: 'list', limit: 20, from: 'Vel', to: 'Kai' },
  });
});

test('Catalouge invocation mapping pins Kai and exposes only historical reading writes', () => {
  assert.deepEqual(tools.kaiRunnerCatalougeInvocation('catalouge_get_book', {
    book_id: 'book-fixture', companion: 'lucien',
  }), {
    tool: 'catalouge_get_book',
    args: { book_id: 'book-fixture', companion: 'kaisoryth' },
  });
  assert.deepEqual(tools.kaiRunnerCatalougeInvocation('catalouge_next_read_session', {
    book_id: 'book-fixture', chunk_count: 99, companion: 'lucien',
  }), {
    tool: 'catalouge_next_read_session',
    args: { book_id: 'book-fixture', companion: 'kaisoryth', chunk_count: 6 },
  });
  const checkpoint = tools.kaiRunnerCatalougeInvocation('catalouge_checkpoint_read_session', {
    book_id: 'book-fixture',
    session_id: 'session-fixture',
    companion: 'lucien',
    annotations: Array.from({ length: 5 }, (_, i) => ({ comment: `note-${i}`, extra: 'drop' })),
    mark_complete: false,
  });
  assert.equal(checkpoint.args.companion, 'kaisoryth');
  assert.equal(checkpoint.args.annotations.length, 3);
  assert.deepEqual(Object.keys(checkpoint.args.annotations[0]), ['comment']);
  assert.equal(tools.kaiRunnerCatalougeInvocation('catalouge_update_progress', {}), null);
  assert.equal(tools.kaiRunnerCatalougeInvocation('catalouge_add_annotation', {}), null);
});
