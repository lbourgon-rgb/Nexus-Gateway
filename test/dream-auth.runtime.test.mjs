import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/dream-auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { authorizeAxiomDream: auth, AXIOM_DREAM_MCP_PATH: path } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const env = { MCP_API_KEY: 'shared-fixture', MCP_API_KEY_NEXT: 'rotation-fixture', AXIOM_DREAM_MCP_API_KEY: 'axiom-only-fixture' };
const request = (token, suffix = '') => new Request(`https://nexus.test${path}${suffix}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('only the dedicated credential authorizes Axiom dream requests', async () => {
  assert.equal(await auth(request(env.AXIOM_DREAM_MCP_API_KEY), env), null);
  for (const token of [undefined, 'invalid', env.MCP_API_KEY, env.MCP_API_KEY_NEXT]) {
    assert.equal((await auth(request(token), env)).status, 401);
  }
  assert.equal((await auth(request(env.AXIOM_DREAM_MCP_API_KEY, '?companion=lucien'), env)).status, 400);
});

test('unset scoped key and accidentally reused shared/rotation keys fail closed', async () => {
  for (const scoped of [undefined, '', env.MCP_API_KEY, env.MCP_API_KEY_NEXT]) {
    assert.equal((await auth(request(scoped), { ...env, AXIOM_DREAM_MCP_API_KEY: scoped })).status, 503);
  }
});

test('dedicated route is intercepted before legacy authentication; legacy registry has no dream tool', async () => {
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(index.indexOf('if (url.pathname === AXIOM_DREAM_MCP_PATH)') < index.indexOf('// Authentication check for /mcp'));
  const init = index.slice(index.indexOf('async init()'), index.indexOf('// CORS headers'));
  assert.doesNotMatch(init, /registerAxiomDreamTool/);
});
