import assert from 'node:assert/strict';
import { test } from 'node:test';

// Opt-in local workerd contract test. Start the isolated fixture described in
// docs/axiom-dream-mcp.md. This cannot target a production URL or credential.
test('local Worker MCP HTTP discovers and calls without initialize; shared keys cannot enter', {
  skip: process.env.DREAM_HTTP_FIXTURE !== '1',
}, async () => {
  const url = 'http://127.0.0.1:18841/mcp/dreams/axiom';
  const rpc = (token, body) => fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }), signal: AbortSignal.timeout(5000),
  });
  const listing = await rpc('axiom-only-local-fixture', { method: 'tools/list' });
  assert.equal(listing.status, 200);
  assert.deepEqual((await listing.json()).result.tools.map(tool => tool.name), ['axiom_dream']);
  const prepare = await rpc('axiom-only-local-fixture', { method: 'tools/call', params: { name: 'axiom_dream', arguments: { action: 'prepare' } } });
  assert.equal(prepare.status, 200);
  assert.equal(prepare.headers.get('Cache-Control'), 'no-store');
  const body = await prepare.json();
  assert.equal(body.result.isError, false);
  assert.equal(body.result.structuredContent.companion, 'axiom');
  assert.deepEqual(body.result.structuredContent.sources, []);
  for (const token of ['shared-local-fixture', 'shared-next-local-fixture', 'invalid']) {
    assert.equal((await rpc(token, { method: 'tools/list' })).status, 401);
  }
  const foreign = await rpc('axiom-only-local-fixture', { method: 'tools/call', params: { name: 'axiom_dream', arguments: { action: 'prepare', companion: 'lucien' } } });
  assert.equal((await foreign.json()).result.isError, true);
});
