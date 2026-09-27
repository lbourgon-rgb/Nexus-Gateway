import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

function moduleUrl(source, replacements = {}) {
  let compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of Object.entries({ zod: import.meta.resolve('zod'), ...replacements })) {
    compiled = compiled.replaceAll(`from '${from}'`, `from '${to}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}
const dreamUrl = moduleUrl(await readFile(new URL('../src/dreams.ts', import.meta.url), 'utf8'));
const dreams = await import(dreamUrl);
const { registerAxiomDreamTool: register } = await import(moduleUrl(
  await readFile(new URL('../src/tools/dreams.ts', import.meta.url), 'utf8'), { '../dreams': dreamUrl },
));
const uuid = '11111111-1111-4111-8111-111111111111';
const claim = { action: 'claim', run_key: 'manual:synthetic-fixture', owner_id: 'test-wake',
  policy_revision: 'test-policy', identity_revision: 'test-identity', source_refs: [] };
const commit = { action: 'commit', run_id: uuid, owner_id: 'test-wake', lease_epoch: 1,
  title: 'Fixture', summary: 'Synthetic fixture only.', content: 'No real dream was generated.',
  context: 'Unit test fixture.', author_provenance: { author: 'axiom', runtime: 'unit-test', model: 'none', method: 'active-wake-thalamus' }, followups: [] };
function fixture(records = [], response) {
  return { MCP_API_KEY: 'gateway-test-only', AXIOM_COGCORE_API_KEY: 'backend-test-only',
    AXIOM_COGCORE: { async fetch(request) {
      records.push({ request, body: request.body ? await request.clone().json() : undefined });
      return response ? response() : Response.json({ companion: 'axiom', ok: true });
    } } };
}

test('all actions use fixed own-lane REST paths and server-only credentials', async () => {
  const records = [], env = fixture(records);
  for (const input of [
    { action: 'prepare' }, claim,
    { action: 'heartbeat', run_id: uuid, owner_id: 'test-wake', lease_epoch: 1, lease_seconds: 300 },
    commit, { action: 'run_get', run_key: 'manual:fixture-1' },
    { action: 'get', dream_id: uuid }, { action: 'list', limit: 2, cursor: 'opaque+cursor/==' },
  ]) assert.equal((await dreams.callDream(env, input)).isError, false);
  assert.deepEqual(records.map(({ request }) => [request.method, new URL(request.url).pathname]), [
    ['GET', '/api/dreams/prepare'], ['POST', '/api/dreams/claim'],
    ['POST', `/api/dreams/runs/${uuid}/heartbeat`], ['POST', `/api/dreams/runs/${uuid}/commit`],
    ['GET', '/api/dreams/runs'], ['GET', `/api/dreams/${uuid}`], ['GET', '/api/dreams'],
  ]);
  for (const { request } of records) {
    assert.equal(new URL(request.url).hostname, 'axiom-cogcore');
    assert.equal(request.headers.get('Authorization'), 'Bearer backend-test-only');
    assert.equal(request.redirect, 'manual');
  }
  assert.equal(new URL(records[4].request.url).searchParams.get('run_key'), 'manual:fixture-1');
  assert.equal(new URL(records[6].request.url).searchParams.get('cursor'), 'opaque+cursor/==');
  const { action, ...claimBody } = claim;
  assert.deepEqual(records[1].body, claimBody);
  assert.equal(records[3].body.run_id, undefined);
  assert.equal(records[3].body.source_refs, undefined);
  assert.equal(records[3].body.author_provenance.author, 'axiom');
});

test('foreign lanes, arbitrary paths, credentials and unused fields never reach a backend', async () => {
  const records = [], env = fixture(records);
  const invalid = [
    { action: 'prepare', companion: 'lucien' }, { action: 'prepare', namespace: 'lucien' },
    { action: 'prepare', path: '/api/identity' }, { action: 'prepare', api_key: 'attack' },
    { action: 'prepare', run_key: 'unused' }, { action: 'get', dream_id: '../identity' },
    { action: 'run_get', run_key: 'query & /?=injection' },
    { ...claim, source_refs: Array.from({ length: 9 }, () => ({ kind: 'reflection', id: uuid })) },
    { action: 'claim', ...claim, source_refs: [{ kind: 'dream', id: uuid }] },
    { ...commit, author_provenance: { ...commit.author_provenance, author: 'lucien' } },
    { ...commit, source_refs: [] }, { action: 'list', limit: 51 }, { action: 'generate' },
  ];
  for (const input of invalid) assert.equal((await dreams.callDream(env, input)).structuredContent.error, 'invalid_dream_arguments');
  assert.equal(records.length, 0);
});

test('missing binding/key fails closed and upstream errors remain tool errors', async () => {
  assert.equal((await dreams.callDream({}, { action: 'prepare' })).isError, true);
  assert.equal((await dreams.callDream({ AXIOM_COGCORE_API_KEY: 'test' }, claim)).isError, true);
  const rejected = await dreams.callDream(fixture([], () => Response.json({ error: 'stale_lease' }, { status: 409 })), commit);
  assert.equal(rejected.isError, true);
  assert.equal(rejected.structuredContent.error, 'stale_lease');
  assert.equal(rejected.structuredContent.status, 409);
  const privateFailure = await dreams.callDream(fixture([], () => new Response('secret and private body', { status: 500 })), commit);
  assert.doesNotMatch(JSON.stringify(privateFailure), /secret and private body/);
  assert.equal(privateFailure.structuredContent.outcome_unknown, true);
});

test('ambiguous writes never retry and tell the author to recover the original run key', async () => {
  const records = [];
  for (const response of [() => { throw new Error('private transport detail'); }, () => new Response('not json')]) {
    const result = await dreams.callDream(fixture(records, response), commit);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.outcome_unknown, true);
    assert.match(result.structuredContent.recovery, /run_get.*original run_key/);
    assert.doesNotMatch(JSON.stringify(result), /private transport detail/);
  }
  assert.equal(records.length, 2);
});

test('wrong backend lane is rejected without disclosing its private response', async () => {
  const result = await dreams.callDream(fixture([], () => Response.json({ companion: 'lucien', content: 'foreign private material' })), { action: 'prepare' });
  assert.equal(result.structuredContent.error, 'dream_backend_lane_mismatch');
  assert.doesNotMatch(JSON.stringify(result), /foreign private material/);
});

test('real MCP discovery and calls expose the strict action schema and explicit errors', async () => {
  const records = [], server = new McpServer({ name: 'test-dreams', version: '1.0.0' });
  register(server, fixture(records));
  const client = new Client({ name: 'fixture-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name), ['axiom_dream']);
    assert.equal(listed.tools[0].inputSchema.type, 'object');
    assert.equal(listed.tools[0].inputSchema.additionalProperties, false);
    assert.deepEqual(listed.tools[0].inputSchema.properties.action.enum, ['prepare', 'claim', 'heartbeat', 'commit', 'get', 'list', 'run_get']);
    assert.equal((await client.callTool({ name: 'axiom_dream', arguments: { action: 'prepare' } })).isError, false);
    assert.equal((await client.callTool({ name: 'axiom_dream', arguments: { action: 'prepare', companion: 'lucien' } })).isError, true);
    assert.equal(records.length, 1);
  } finally { await client.close(); await server.close(); }
});
