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
const CURRENT_API_KEY = 'fixture-current-mcp-api-key';
const NEXT_API_KEY = 'fixture-next-mcp-api-key';
const WRONG_API_KEY = 'fixture-wrong-mcp-api-key';
const VEL_PREFLIGHT_DISCORD_API_KEY = 'fixture-vel-preflight-discord-key';
const KAI_MODEL_CANARY_KEY = 'fixture-kai-model-canary-key';
const PRIVATE_ROUTES = [
  '/api/kaisoryth/context',
  '/api/kaisoryth/brain-status',
  '/api/kaisoryth/reading-status',
  '/api/kaisoryth/mind-dashboard',
];
const PUBLIC_ROUTES = ['/health', '/status/summary'];
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const wranglerPath = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

const backendMock = `
let checkpointStarted = 0;
let checkpointCompleted = 0;
let checkpointAborted = 0;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/runner-presence/kaisoryth') {
      return Response.json({ companion_id: 'kaisoryth', active: false, lease: null });
    }
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
      if (name === 'catalouge_checkpoint_read_session') {
        checkpointStarted += 1;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4000);
          request.signal.addEventListener('abort', () => {
            checkpointAborted += 1;
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
        if (request.signal.aborted) return Response.json({ error: 'aborted' }, { status: 499 });
        checkpointCompleted += 1;
      }
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
    if (url.pathname === '/stats') return Response.json({ checkpointStarted, checkpointCompleted, checkpointAborted });
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

const activePresenceMock = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/runner-presence/kaisoryth') {
      return Response.json({
        companion_id: 'kaisoryth',
        active: true,
        lease: {
          companion_id: 'kaisoryth',
          runner_id: 'kai-harness:mini-pc',
          lease_epoch: 7,
          lease_expires_at: '2099-01-01 00:00:00',
        },
      });
    }
    return Response.json({ error: 'unexpected presence path' }, { status: 404 });
  },
};
`;

const openRouterMock = `
let grokCalls = 0;
let totalCalls = 0;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/stats') return Response.json({ totalCalls, grokCalls });
    const body = await request.json();
    totalCalls += 1;
    if (body.model === 'z-ai/glm-5.2') {
      return Response.json({ error: { message: 'fixture provider unavailable', metadata: { error_type: 'provider_unavailable' } } }, { status: 503 });
    }
    if (body.model !== 'x-ai/grok-4.5') return Response.json({ error: { message: 'unexpected model' } }, { status: 400 });
    grokCalls += 1;
    if (grokCalls === 1) {
      return Response.json({ model: 'x-ai/grok-4.5', provider: 'xai', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'fixture-tool', type: 'function', function: { name: 'kaisoryth_orient', arguments: '{}' } }] } }] });
    }
    return Response.json({ model: 'x-ai/grok-4.5', provider: 'xai', choices: [{ finish_reason: 'stop', message: { content: 'Grounded backup reply after Kai mind read.' } }] });
  },
};
`;

const deadlineOpenRouterMock = `
export default {
  async fetch(request) {
    const body = await request.json();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return Response.json({
      model: body.model,
      provider: 'z-ai',
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'deadline-write', type: 'function', function: { name: 'catalouge_checkpoint_read_session', arguments: JSON.stringify({ book_id: 'book-fixture', session_id: 'session-fixture', summary: 'deadline fixture', annotations: [] }) } }] } }],
    });
  },
};
`;

let root;
let oldOnly;
let nextOnly;
let both;
let missingConfig;
let duplicatePreflightConfig;
let mcpCollisionPreflightConfig;
let routingFallback;
let deadlineAbort;
let activeLane;

function runtime(bundlePath, { current, next, preflightDiscord, preflightCodex, routeOpenRouter = false, deadlineOpenRouter = false, activePresence = false } = {}) {
  return new Miniflare({
    workers: [
      {
        name: 'nexus',
        compatibilityDate: '2025-01-01',
        compatibilityFlags: ['nodejs_compat'],
        modules: true,
        modulesRoot: path.dirname(bundlePath),
        scriptPath: bundlePath,
        durableObjects: { MCP_OBJECT: { className: 'NexusGateway', useSQLite: true } },
        bindings: {
          ...(current ? { MCP_API_KEY: current } : {}),
          ...(next ? { MCP_API_KEY_NEXT: next } : {}),
          ...(preflightDiscord ? { VEL_PREFLIGHT_DISCORD_API_KEY: preflightDiscord } : {}),
          ...(preflightCodex ? { VEL_PREFLIGHT_CODEX_API_KEY: preflightCodex } : {}),
          SERYTHRAE_MIND_API_KEY: 'fixture-mind-key',
          CONTINUITY_API_KEY: 'fixture-continuity-key',
          KAI_RUNNER_ENABLED: 'true',
          KAI_MODEL_CANARY_KEY,
          ...((routeOpenRouter || deadlineOpenRouter) ? { OPENROUTER_API_KEY: 'fixture-openrouter-key', OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1' } : {}),
          ...(deadlineOpenRouter ? { KAI_RUNNER_TOTAL_TIMEOUT_MS: '5000', KAI_RUNNER_MODEL_TIMEOUT_MS: '5000', KAI_RUNNER_TOOL_TIMEOUT_MS: '10000' } : {}),
        },
        ...((routeOpenRouter || deadlineOpenRouter) ? { outboundService: 'openrouter-mock' } : {}),
        serviceBindings: {
          CONTINUITY: activePresence ? 'presence-active-mock' : 'backend-mock',
          ARCHIVE: 'backend-mock',
          CATALOUGE: 'backend-mock',
          SERYTHRAE_MIND: 'backend-mock',
          SERYTHRAE_GATEWAY: 'backend-mock',
        },
      },
      {
        name: 'backend-mock',
        compatibilityDate: '2025-01-01',
        modules: true,
        script: backendMock,
      },
      ...(activePresence ? [{ name: 'presence-active-mock', compatibilityDate: '2025-01-01', modules: true, script: activePresenceMock }] : []),
      ...((routeOpenRouter || deadlineOpenRouter) ? [{ name: 'openrouter-mock', compatibilityDate: '2025-01-01', modules: true, script: deadlineOpenRouter ? deadlineOpenRouterMock : openRouterMock }] : []),
    ],
  });
}

async function request(worker, route, { authorization, method = 'GET', headers, body, baseUrl = 'https://nexus.test' } = {}) {
  const requestHeaders = new Headers(headers);
  if (authorization) requestHeaders.set('Authorization', authorization);
  return worker.dispatchFetch(`${baseUrl}${route}`, {
    method,
    headers: requestHeaders,
    body,
  });
}

async function get(worker, route, authorization) {
  return request(worker, route, { authorization });
}

function assertHeadersDoNotLeak(response, secrets, label) {
  const exposed = [response.url, ...[...response.headers.entries()].flat()].join('\n');
  for (const secret of secrets) {
    assert.doesNotMatch(exposed, new RegExp(secret, 'g'), `${label} leaked ${secret} in response metadata`);
  }
}

function assertTextDoesNotLeak(text, secrets, label) {
  for (const secret of secrets) {
    assert.doesNotMatch(text, new RegExp(secret, 'g'), `${label} leaked ${secret} in response body`);
  }
}

async function mcpNotification(worker, route, authorization) {
  return request(worker, route, {
    authorization,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
}

async function assertSseAuthAccepted(worker, route, authorization, label) {
  const response = await request(worker, route, { authorization });
  assert.notEqual(response.status, 401, `${label} was rejected`);
  assert.notEqual(response.status, 503, `${label} was treated as unconfigured`);
  assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY], label);
  await response.body?.cancel();
}

async function assertSseMessageAuthAccepted(worker, authorization, label) {
  const response = await request(worker, '/sse/message', {
    authorization,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.notEqual(response.status, 503, `${label} was treated as unconfigured`);
  assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY], label);
  const text = await response.text();
  assert.notEqual(text, JSON.stringify({ error: 'Unauthorized — invalid or missing Bearer token' }), `${label} failed at the outer auth guard`);
  assertTextDoesNotLeak(text, [CURRENT_API_KEY, NEXT_API_KEY], label);
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
  oldOnly = runtime(bundlePath, { current: CURRENT_API_KEY, preflightDiscord: VEL_PREFLIGHT_DISCORD_API_KEY });
  nextOnly = runtime(bundlePath, { next: NEXT_API_KEY, preflightDiscord: VEL_PREFLIGHT_DISCORD_API_KEY });
  both = runtime(bundlePath, { current: CURRENT_API_KEY, next: NEXT_API_KEY, preflightDiscord: VEL_PREFLIGHT_DISCORD_API_KEY });
  missingConfig = runtime(bundlePath);
  duplicatePreflightConfig = runtime(bundlePath, {
    current: CURRENT_API_KEY,
    preflightDiscord: VEL_PREFLIGHT_DISCORD_API_KEY,
    preflightCodex: VEL_PREFLIGHT_DISCORD_API_KEY,
  });
  mcpCollisionPreflightConfig = runtime(bundlePath, {
    current: CURRENT_API_KEY,
    preflightDiscord: CURRENT_API_KEY,
  });
  routingFallback = runtime(bundlePath, { current: CURRENT_API_KEY, routeOpenRouter: true });
  deadlineAbort = runtime(bundlePath, { current: CURRENT_API_KEY, deadlineOpenRouter: true });
  activeLane = runtime(bundlePath, { current: CURRENT_API_KEY, routeOpenRouter: true, activePresence: true });
  await Promise.all([
    oldOnly.ready,
    nextOnly.ready,
    both.ready,
    missingConfig.ready,
    duplicatePreflightConfig.ready,
    mcpCollisionPreflightConfig.ready,
    routingFallback.ready,
    deadlineAbort.ready,
    activeLane.ready,
  ]);
});

after(async () => {
  await Promise.all([
    oldOnly?.dispose(),
    nextOnly?.dispose(),
    both?.dispose(),
    missingConfig?.dispose(),
    duplicatePreflightConfig?.dispose(),
    mcpCollisionPreflightConfig?.dispose(),
    routingFallback?.dispose(),
    deadlineAbort?.dispose(),
    activeLane?.dispose(),
  ]);
  await rm(root, { recursive: true, force: true });
});

test('private Kai status routes return 503 when MCP bearer configuration is missing', async () => {
  for (const route of PRIVATE_ROUTES) {
    const response = await get(missingConfig, route);
    assert.equal(response.status, 503, route);
    assert.deepEqual(await response.json(), { error: 'MCP_API_KEY is not configured' });
  }
});

test('private Kai status routes reject missing and incorrect bearer credentials without leaking secrets', async () => {
  for (const [name, worker] of [['old-only', oldOnly], ['next-only', nextOnly], ['both', both]]) {
    for (const route of PRIVATE_ROUTES) {
      for (const [credential, authorization] of [['missing', undefined], ['wrong', `Bearer ${WRONG_API_KEY}`]]) {
        const response = await get(worker, route, authorization);
        assert.equal(response.status, 401, `${name} ${route} ${credential} bearer`);
        assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY], `${name} ${route} ${credential}`);
        const text = await response.text();
        assertTextDoesNotLeak(text, [CURRENT_API_KEY, NEXT_API_KEY], `${name} ${route} ${credential}`);
        assert.deepEqual(JSON.parse(text), { error: 'Unauthorized' });
      }
    }
  }
});

test('private Kai status routes support old-only, next-only, and dual-key rotation states', async () => {
  const accepted = [
    ['old-only current', oldOnly, CURRENT_API_KEY],
    ['next-only next', nextOnly, NEXT_API_KEY],
    ['both current', both, CURRENT_API_KEY],
    ['both next', both, NEXT_API_KEY],
  ];
  for (const [name, worker, key] of accepted) {
    for (const route of PRIVATE_ROUTES) {
      const response = await get(worker, route, `Bearer ${key}`);
      assert.equal(response.status, 200, `${name} ${route}`);
      const body = await response.json();
      assert.equal(body.companion_id, 'kaisoryth', `${name} ${route}`);
    }
  }

  assert.equal((await get(oldOnly, PRIVATE_ROUTES[0], `Bearer ${NEXT_API_KEY}`)).status, 401);
  assert.equal((await get(nextOnly, PRIVATE_ROUTES[0], `Bearer ${CURRENT_API_KEY}`)).status, 401);
});

test('MCP header and URL-path authentication support every rotation state', async () => {
  const accepted = [
    ['old-only current', oldOnly, CURRENT_API_KEY],
    ['next-only next', nextOnly, NEXT_API_KEY],
    ['both current', both, CURRENT_API_KEY],
    ['both next', both, NEXT_API_KEY],
  ];
  for (const [name, worker, key] of accepted) {
    const headerResponse = await mcpNotification(worker, '/mcp', `Bearer ${key}`);
    assert.equal(headerResponse.status, 202, `${name} MCP header`);
    assertHeadersDoNotLeak(headerResponse, [CURRENT_API_KEY, NEXT_API_KEY], `${name} MCP header`);

    const pathResponse = await mcpNotification(worker, `/mcp/${key}`);
    assert.equal(pathResponse.status, 202, `${name} MCP path`);
    assertHeadersDoNotLeak(pathResponse, [CURRENT_API_KEY, NEXT_API_KEY], `${name} MCP path`);
  }
});

test('SSE header, message, and URL-path authentication support both rotation credentials', async () => {
  for (const [name, worker, key] of [
    ['old-only current', oldOnly, CURRENT_API_KEY],
    ['next-only next', nextOnly, NEXT_API_KEY],
    ['both current', both, CURRENT_API_KEY],
    ['both next', both, NEXT_API_KEY],
  ]) {
    await assertSseAuthAccepted(worker, '/sse', `Bearer ${key}`, `${name} SSE header`);
    await assertSseAuthAccepted(worker, `/sse/${key}`, undefined, `${name} SSE path`);
    await assertSseMessageAuthAccepted(worker, `Bearer ${key}`, `${name} SSE message`);
  }
});

test('MCP and SSE transports fail closed for missing, wrong, and unconfigured credentials without secret leakage', async () => {
  for (const route of ['/mcp', '/sse', '/sse/message']) {
    for (const [credential, authorization] of [['missing', undefined], ['wrong', `Bearer ${WRONG_API_KEY}`]]) {
      const response = await request(both, route, { authorization });
      assert.equal(response.status, 401, `${route} ${credential}`);
      assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY], `${route} ${credential}`);
      assertTextDoesNotLeak(await response.text(), [CURRENT_API_KEY, NEXT_API_KEY], `${route} ${credential}`);
    }

    const unconfigured = await request(missingConfig, route);
    assert.equal(unconfigured.status, 503, `${route} unconfigured`);
  }

  for (const route of [`/mcp/${WRONG_API_KEY}`, `/sse/${WRONG_API_KEY}`]) {
    const response = await request(both, route);
    assert.equal(response.status, 401, `${route} wrong path credential`);
    assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY], `${route} wrong path credential`);
    const text = await response.text();
    assertTextDoesNotLeak(text, [CURRENT_API_KEY, NEXT_API_KEY, WRONG_API_KEY], `${route} wrong path credential`);
  }

  for (const [name, worker, inactiveKey] of [
    ['old-only', oldOnly, NEXT_API_KEY],
    ['next-only', nextOnly, CURRENT_API_KEY],
  ]) {
    assert.equal((await request(worker, '/mcp', { authorization: `Bearer ${inactiveKey}` })).status, 401, `${name} inactive MCP header key`);
    assert.equal((await request(worker, `/mcp/${inactiveKey}`)).status, 401, `${name} inactive MCP path key`);
    assert.equal((await request(worker, '/sse', { authorization: `Bearer ${inactiveKey}` })).status, 401, `${name} inactive SSE header key`);
    assert.equal((await request(worker, `/sse/${inactiveKey}`)).status, 401, `${name} inactive SSE path key`);
  }
});

test('canonical Nexus Kai runner auth accepts either configured key, fails closed without keys, and preserves internal bypass', async () => {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '' }),
  };

  assert.equal((await request(nextOnly, '/api/kaisoryth/run', {
    ...init,
    authorization: `Bearer ${CURRENT_API_KEY}`,
  })).status, 401, 'next-only runner rejects inactive current key');

  for (const [name, worker] of [['old-only', oldOnly], ['next-only', nextOnly], ['both', both]]) {
    for (const route of ['/api/kaisoryth/run', '/api/kaisoryth/runner-preview']) {
      assert.equal((await request(worker, route, init)).status, 401, `${name} ${route} rejects missing bearer`);
      assert.equal((await request(worker, route, {
        ...init,
        authorization: `Bearer ${WRONG_API_KEY}`,
      })).status, 401, `${name} ${route} rejects wrong bearer`);
    }
  }

  for (const [name, worker, authorization, baseUrl] of [
    ['next-only external', nextOnly, `Bearer ${NEXT_API_KEY}`, 'https://nexus.test'],
    ['both external current', both, `Bearer ${CURRENT_API_KEY}`, 'https://nexus.test'],
    ['both external next', both, `Bearer ${NEXT_API_KEY}`, 'https://nexus.test'],
    ['internal bypass', nextOnly, `Bearer ${WRONG_API_KEY}`, 'https://nexus.internal'],
  ]) {
    const response = await request(worker, '/api/kaisoryth/run', { ...init, authorization, baseUrl });
    assert.notEqual(response.status, 401, `${name} should pass canonical runner auth`);
    assert.notEqual(response.status, 503, `${name} should not require missing auth configuration`);
    assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY, WRONG_API_KEY], name);
    assertTextDoesNotLeak(await response.text(), [CURRENT_API_KEY, NEXT_API_KEY, WRONG_API_KEY], name);
  }

  for (const [name, worker, authorization] of [
    ['old-only preview', oldOnly, `Bearer ${CURRENT_API_KEY}`],
    ['next-only preview', nextOnly, `Bearer ${NEXT_API_KEY}`],
    ['both preview current', both, `Bearer ${CURRENT_API_KEY}`],
    ['both preview next', both, `Bearer ${NEXT_API_KEY}`],
  ]) {
    const response = await request(worker, '/api/kaisoryth/runner-preview', { ...init, authorization });
    assert.notEqual(response.status, 401, `${name} should pass canonical runner auth`);
    assert.notEqual(response.status, 503, `${name} should not require missing auth configuration`);
    assertHeadersDoNotLeak(response, [CURRENT_API_KEY, NEXT_API_KEY, WRONG_API_KEY], name);
    assertTextDoesNotLeak(await response.text(), [CURRENT_API_KEY, NEXT_API_KEY, WRONG_API_KEY], name);
  }

  for (const route of ['/api/kaisoryth/run', '/api/kaisoryth/runner-preview']) {
    const response = await request(missingConfig, route, init);
    assert.equal(response.status, 503, `${route} must fail closed when MCP authority is unconfigured`);
    assert.deepEqual(await response.json(), { error: 'MCP_API_KEY is not configured' });
  }
});

test('live Kai harness presence returns a body-free delegated receipt before any model call', async () => {
  for (const route of ['/api/kaisoryth/run', '/api/kaisoryth/runner-preview']) {
    const response = await request(activeLane, route, {
      method: 'POST',
      authorization: `Bearer ${CURRENT_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'This must never reach a model while the harness lease is live.' }),
    });
    assert.equal(response.status, 202, route);
    assert.equal(response.headers.get('X-Nexus-Kai-Decision'), 'delegated_to_runner');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), '');
  }
  const openRouter = await activeLane.getWorker('openrouter-mock');
  const stats = await (await openRouter.fetch('https://openrouter.test/stats')).json();
  assert.equal(stats.totalCalls, 0);
});

test('Kai fallback simulation requires the distinct canary key', async () => {
  const body = JSON.stringify({
    content: 'bounded fallback canary',
    model_canary: { simulate_primary_failure: true, reason_code: 'explicit-live-canary' },
  });
  for (const provided of [undefined, 'wrong-canary-key']) {
    const response = await request(both, '/api/kaisoryth/run', {
      method: 'POST',
      authorization: `Bearer ${CURRENT_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        ...(provided ? { 'X-Nexus-Kai-Canary': provided } : {}),
      },
      body,
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'Kai model canary authorization failed' });
  }

  const authorized = await request(both, '/api/kaisoryth/run', {
    method: 'POST',
    authorization: `Bearer ${CURRENT_API_KEY}`,
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Kai-Canary': KAI_MODEL_CANARY_KEY },
    body,
  });
  assert.notEqual(authorized.status, 403);
  assertTextDoesNotLeak(await authorized.text(), [KAI_MODEL_CANARY_KEY], 'authorized model canary');
});

test('real primary HTTP failure selects exact Grok backup and stays latched after a tool round', async () => {
  const response = await request(routingFallback, '/api/kaisoryth/run', {
    method: 'POST',
    authorization: `Bearer ${CURRENT_API_KEY}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Use your private orientation once, then answer this fallback canary.' }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.generation.fallback_used, true);
  assert.equal(result.generation.model, 'x-ai/grok-4.5');
  assert.equal(result.generation.primary_failure.category, 'provider_unavailable');
  assert.equal(result.response, 'Grounded backup reply after Kai mind read.');
  assert.equal(result.tool_loop.receipts.filter((receipt) => receipt.tool === 'kaisoryth_orient' && receipt.status === 'executed').length, 1);
  const diagnosticModels = result.tool_loop.model_diagnostics.map((item) => item.endpoint_model).filter(Boolean);
  assert.deepEqual(diagnosticModels, ['z-ai/glm-5.2', 'x-ai/grok-4.5', 'x-ai/grok-4.5']);
});

test('runner deadline refuses a model-authorized Catalouge write that cannot finish inside the request budget', async () => {
  const response = await request(deadlineAbort, '/api/kaisoryth/run', {
    method: 'POST',
    authorization: `Bearer ${CURRENT_API_KEY}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Run the bounded checkpoint deadline fixture.',
      write_policy: {
        allow: true,
        scopes: ['catalouge'],
        reason_code: 'explicit-user-request',
      },
    }),
  });
  assert.equal(response.status, 504);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const backend = await deadlineAbort.getWorker('backend-mock');
  const stats = await (await backend.fetch('https://backend.test/stats')).json();
  assert.equal(stats.checkpointStarted, 0);
  assert.equal(stats.checkpointCompleted, 0);
  assert.equal(stats.checkpointAborted, 0);
});

test('health and sanitized status summary remain public without a bearer credential', async () => {
  for (const worker of [oldOnly, nextOnly, both, missingConfig]) {
    for (const route of PUBLIC_ROUTES) {
      const response = await get(worker, route);
      assert.equal(response.status, 200, route);
      const body = await response.json();
      assert.equal(body.service, 'nexus-gateway', route);
    }
  }
});

test('Vel preflight route rejects general MCP and caller-asserted identity in favor of a server-owned lane key', async () => {
  const body = JSON.stringify({
    author_is_vel: true,
    verification: 'codex-local-user-session',
    include_cycle: false,
  });
  for (const [name, worker, generalMcpKey] of [
    ['old-only', oldOnly, CURRENT_API_KEY],
    ['next-only', nextOnly, NEXT_API_KEY],
    ['both-current', both, CURRENT_API_KEY],
    ['both-next', both, NEXT_API_KEY],
  ]) {
    for (const authorization of [undefined, `Bearer ${WRONG_API_KEY}`, `Bearer ${generalMcpKey}`]) {
      const denied = await request(worker, '/api/preflight/vel', {
        method: 'POST',
        authorization,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(denied.status, 401, `${name} accepted a non-preflight credential`);
    }
    const accepted = await request(worker, '/api/preflight/vel', {
      method: 'POST',
      authorization: `Bearer ${VEL_PREFLIGHT_DISCORD_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(accepted.status, 200, name);
    const payload = await accepted.json();
    assert.equal(payload.queried, true);
    assert.equal(payload.source, 'pulsesync');
    assert.equal(payload.verification, 'discord-owner-registry');
    assert.equal(payload.reason, 'pulsesync_binding_unavailable');
    assert.equal(payload.privacy.raw_values_included, false);
  }

  const unconfigured = await request(missingConfig, '/api/preflight/vel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assert.equal(unconfigured.status, 503);
  assert.deepEqual(await unconfigured.json(), { error: 'Vel preflight caller credentials are not configured' });
});

test('Vel preflight fails closed when lane credentials are duplicated or collide with general MCP authority', async () => {
  for (const [label, worker, bearer] of [
    ['duplicate lanes', duplicatePreflightConfig, VEL_PREFLIGHT_DISCORD_API_KEY],
    ['MCP collision', mcpCollisionPreflightConfig, CURRENT_API_KEY],
  ]) {
    const response = await request(worker, '/api/preflight/vel', {
      method: 'POST',
      authorization: `Bearer ${bearer}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include_cycle: false }),
    });
    assert.equal(response.status, 503, label);
    assert.deepEqual(await response.json(), {
      error: 'Vel preflight caller credential configuration is ambiguous',
    }, label);
  }
});
