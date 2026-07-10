import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { Miniflare } from 'miniflare';

const execFileAsync = promisify(execFile);
const API_KEY = 'fixture-mcp-api-key';
const PRIVATE_ROUTES = [
  '/api/kaisoryth/brain-status',
  '/api/kaisoryth/reading-status',
  '/api/kaisoryth/mind-dashboard',
];
const PUBLIC_ROUTES = ['/health', '/status/summary'];
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const wranglerPath = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

const backendMock = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      const rpc = await request.json();
      if (rpc.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'kai-status-auth-fixture', version: '1.0.0' },
          },
        }, { headers: { 'Mcp-Session-Id': 'fixture-session' } });
      }

      const name = rpc.params?.name;
      const result = name === 'catalouge_list_books' || name === 'catalouge_search_books'
        ? { books: [{ id: 'book-fixture', title: 'Our Perfect Storm' }] }
        : name === 'catalouge_get_annotations'
          ? { annotations: [] }
          : { progress: { percent: 20 } };
      return Response.json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      });
    }

    if (url.pathname === '/mind-health') {
      return Response.json({ threads: 2, observations: 3, avgStrength: 0.8, entropy: 0.2 });
    }
    if (url.pathname.startsWith('/knowledge')) {
      return Response.json({ total: 4, status: { ready: 4 }, categories: [] });
    }
    if (url.pathname.startsWith('/api/archive/stats')) {
      return Response.json({ total_messages: 5 });
    }
    return Response.json({
      ok: true,
      threads: [],
      dreams: [],
      sessions: [],
      drives: [],
      observations: [],
      entries: [],
    });
  },
};
`;

let root;
let configured;
let missingConfig;

function runtime(bundlePath, apiKey) {
  return new Miniflare({
    workers: [
      {
        name: 'nexus',
        compatibilityDate: '2025-01-01',
        compatibilityFlags: ['nodejs_compat'],
        modules: true,
        modulesRoot: path.dirname(bundlePath),
        scriptPath: bundlePath,
        durableObjects: { MCP_OBJECT: 'NexusGateway' },
        bindings: {
          ...(apiKey ? { MCP_API_KEY: apiKey } : {}),
          SERYTHRAE_MIND_API_KEY: 'fixture-mind-key',
        },
        serviceBindings: {
          ARCHIVE: 'backend-mock',
          CATALOUGE: 'backend-mock',
          SERYTHRAE_MIND: 'backend-mock',
        },
      },
      {
        name: 'backend-mock',
        compatibilityDate: '2025-01-01',
        modules: true,
        script: backendMock,
      },
    ],
  });
}

async function get(worker, route, authorization) {
  const headers = authorization ? { Authorization: authorization } : undefined;
  return worker.dispatchFetch(`https://nexus.test${route}`, { headers });
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nexus-kai-status-auth-'));
  await execFileAsync(process.execPath, [
    wranglerPath,
    'deploy',
    '--dry-run',
    '--outdir',
    root,
  ], {
    cwd: repoRoot,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  const bundlePath = path.join(root, 'index.js');
  configured = runtime(bundlePath, API_KEY);
  missingConfig = runtime(bundlePath, null);
  await Promise.all([configured.ready, missingConfig.ready]);
});

after(async () => {
  await Promise.all([configured?.dispose(), missingConfig?.dispose()]);
  await rm(root, { recursive: true, force: true });
});

test('private Kai status routes return 503 when MCP bearer configuration is missing', async () => {
  for (const route of PRIVATE_ROUTES) {
    const response = await get(missingConfig, route);
    assert.equal(response.status, 503, route);
    assert.deepEqual(await response.json(), { error: 'MCP_API_KEY is not configured' });
  }
});

test('private Kai status routes reject missing and incorrect bearer credentials', async () => {
  for (const route of PRIVATE_ROUTES) {
    const missing = await get(configured, route);
    assert.equal(missing.status, 401, `${route} missing bearer`);
    assert.deepEqual(await missing.json(), { error: 'Unauthorized' });

    const wrong = await get(configured, route, 'Bearer wrong-key');
    assert.equal(wrong.status, 401, `${route} wrong bearer`);
    assert.deepEqual(await wrong.json(), { error: 'Unauthorized' });
  }
});

test('private Kai status routes accept the configured bearer credential', async () => {
  for (const route of PRIVATE_ROUTES) {
    const response = await get(configured, route, `Bearer ${API_KEY}`);
    assert.equal(response.status, 200, route);
    const body = await response.json();
    assert.equal(body.companion_id, 'kaisoryth', route);
  }
});

test('health and sanitized status summary remain public without a bearer credential', async () => {
  for (const worker of [configured, missingConfig]) {
    for (const route of PUBLIC_ROUTES) {
      const response = await get(worker, route);
      assert.equal(response.status, 200, route);
      const body = await response.json();
      assert.equal(body.service, 'nexus-gateway', route);
    }
  }
});
