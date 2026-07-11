import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const runtimeSource = await readFile(new URL('../src/axiom-board.ts', import.meta.url), 'utf8');
const toolSource = await readFile(new URL('../src/tools/axiom-board.ts', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(runtimeSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const board = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixtureEnv(records, apiKey = 'server-only-secret') {
  return {
    AXIOM_COGCORE_API_KEY: apiKey,
    AXIOM_COGCORE: {
      async fetch(request) {
        const body = request.body ? await request.clone().json() : undefined;
        records.push({ request, body });
        return Response.json({ card: { id: 'card-1', version: 2 } });
      },
    },
  };
}

test('registers only the six narrow Axiom board tools without caller-controlled backend routing', () => {
  const names = [...toolSource.matchAll(/server\.tool\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(names, [
    'axiom_board_list',
    'axiom_board_create',
    'axiom_board_update',
    'axiom_board_move',
    'axiom_board_archive',
    'axiom_board_restore',
  ]);
  assert.match(indexSource, /registerAxiomBoardTools\(this\.server, this\.env\)/);
  assert.doesNotMatch(toolSource, /companion\s*:|table\s*:|path\s*:|api_?key\s*:|credential\s*:/i);
  assert.match(toolSource, /expected_version: z\.number\(\)\.int\(\)\.min\(1\)/);
  assert.equal((toolSource.match(/expected_version: z\.number\(\)\.int\(\)\.min\(1\)/g) || []).length, 4);
});

test('list uses the exact route, safely encoded filters, and a server-side bearer only', async () => {
  const records = [];
  const result = await board.listAxiomBoardCards(fixtureEnv(records), {
    project: 'Axiom & Kai/board?owner=attacker',
    owner: 'Vel + Axiom',
    status: 'in_progress',
    priority: 'high',
    include_archived: false,
  });
  assert.equal(records.length, 1);
  const { request, body } = records[0];
  const url = new URL(request.url);
  assert.equal(request.method, 'GET');
  assert.equal(url.pathname, '/api/board/cards');
  assert.equal(url.searchParams.get('project'), 'Axiom & Kai/board?owner=attacker');
  assert.equal(url.searchParams.get('owner'), 'Vel + Axiom');
  assert.equal(url.searchParams.get('status'), 'in_progress');
  assert.equal(url.searchParams.get('priority'), 'high');
  assert.equal(url.searchParams.get('include_archived'), 'false');
  assert.equal(url.searchParams.get('api_key'), null);
  assert.equal(request.headers.get('Authorization'), 'Bearer server-only-secret');
  assert.equal(body, undefined);
  assert.match(result.content[0].text, /"card"/);
});

test('create, update, move, archive, and restore use exact paths and preserve expected_version', async () => {
  const records = [];
  const env = fixtureEnv(records);
  await board.createAxiomBoardCard(env, { title: 'Ship board', status: 'ready', source: 'caller-controlled' });
  await board.updateAxiomBoardCard(env, 'card/unsafe id', { notes: 'Ready', expected_version: 3 });
  await board.moveAxiomBoardCard(env, 'card-1', { status: 'done', position: 0, expected_version: 4 });
  await board.archiveAxiomBoardCard(env, 'card-1', 5);
  await board.restoreAxiomBoardCard(env, 'card-1', 6);

  assert.deepEqual(records.map(({ request }) => [request.method, new URL(request.url).pathname]), [
    ['POST', '/api/board/cards'],
    ['PATCH', '/api/board/cards/card%2Funsafe%20id'],
    ['PATCH', '/api/board/cards/card-1'],
    ['POST', '/api/board/cards/card-1/archive'],
    ['POST', '/api/board/cards/card-1/restore'],
  ]);
  assert.deepEqual(records.map(({ body }) => body), [
    { title: 'Ship board', status: 'ready', source: 'axiom-nexus-tool' },
    { notes: 'Ready', expected_version: 3 },
    { status: 'done', position: 0, expected_version: 4 },
    { expected_version: 5 },
    { expected_version: 6 },
  ]);
});

test('missing service binding or backend key fails clearly without making a request', async () => {
  const missingBinding = await board.listAxiomBoardCards({ AXIOM_COGCORE_API_KEY: 'secret' }, {});
  assert.match(missingBinding.content[0].text, /AXIOM_COGCORE service binding is not configured/);

  let calls = 0;
  const missingKey = await board.createAxiomBoardCard({
    AXIOM_COGCORE: { async fetch() { calls += 1; throw new Error('must not run'); } },
  }, { title: 'Nope' });
  assert.match(missingKey.content[0].text, /AXIOM_COGCORE_API_KEY is not configured/);
  assert.equal(calls, 0);
});

test('upstream failures are returned as explicit tool errors', async () => {
  const env = {
    AXIOM_COGCORE_API_KEY: 'secret',
    AXIOM_COGCORE: { async fetch() { return Response.json({ error: 'stale_version' }, { status: 409 }); } },
  };
  const result = await board.updateAxiomBoardCard(env, 'card-1', { expected_version: 1, title: 'Conflict' });
  assert.match(result.content[0].text, /^Error 409:/);
  assert.match(result.content[0].text, /stale_version/);
});
