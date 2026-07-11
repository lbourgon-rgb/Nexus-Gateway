import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';

let tempRoot;
let proxy;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'proxy-mcp-test-'));
  const source = await readFile(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const modulePath = path.join(tempRoot, 'proxy.mjs');
  await writeFile(modulePath, output, 'utf8');
  proxy = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

test('service-bound MCP calls authenticate both initialize and tool requests', async () => {
  const seen = [];
  const service = {
    async fetch(request) {
      seen.push({ authorization: request.headers.get('Authorization'), body: await request.json() });
      if (seen.length === 1) {
        return Response.json({ jsonrpc: '2.0', id: 1, result: {} }, { headers: { 'Mcp-Session-Id': 'fixture-session' } });
      }
      return Response.json({
        jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      });
    },
  };
  const result = await proxy.proxyMcp(undefined, 'nesteq_orient', {}, 'fixture-secret', service);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map(entry => entry.authorization), ['Bearer fixture-secret', 'Bearer fixture-secret']);
  assert.equal(seen[1].body.params.name, 'nesteq_orient');
  assert.equal(result.content[0].text, JSON.stringify({ ok: true }));
});

test('MCP initialize and tool HTTP failures return explicit error results', async () => {
  const initFailure = await proxy.proxyMcp(undefined, 'nesteq_orient', {}, 'fixture-secret', {
    async fetch() { return new Response('denied', { status: 401 }); },
  });
  assert.match(initFailure.content[0].text, /MCP Error: initialization failed \(401\)/);

  let calls = 0;
  const toolFailure = await proxy.proxyMcp(undefined, 'catalouge_get_book', {}, undefined, {
    async fetch() {
      calls += 1;
      return calls === 1
        ? Response.json({ jsonrpc: '2.0', id: 1, result: {} }, { headers: { 'Mcp-Session-Id': 'fixture-session' } })
        : new Response('backend unavailable', { status: 503 });
    },
  });
  assert.match(toolFailure.content[0].text, /MCP Error: tool catalouge_get_book failed \(503\)/);
});
