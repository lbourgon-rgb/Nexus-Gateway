import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = (await readFile(new URL('../src/tools/serythrae.ts', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false,
  },
}).outputText
const serythraeModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const { callSerythraeDoorway } = serythraeModule

test('Nexus pins Kai scope and prepends the shared hallway to Serythrae route receipts', async () => {
  let seen
  const env = {
    SERYTHRAE_GATEWAY: {
      async fetch(request) {
        seen = await request.json()
        return Response.json({
          jsonrpc: '2.0',
          id: seen.id,
          result: {
            structuredContent: {
              ok: true,
              route_receipt: {
                receipt_id: 'fixture-receipt',
                generated_at: '2026-07-30T12:00:00.000Z',
                hops: [
                  { service: 'serythrae-gw', role: 'kai-companion-doorway' },
                  { service: 'catalouge', role: 'capability-owner' },
                ],
              },
            },
          },
        })
      },
    },
  }

  const response = await callSerythraeDoorway(env, 'tools/call', {
    companion_id: 'morzar',
    name: 'catalouge_list_books',
    arguments: {},
  })
  const payload = JSON.parse(response.content[0].text)

  assert.equal(seen.params.companion_id, 'kaisoryth')
  assert.equal(seen.params.name, 'catalouge_list_books')
  assert.equal(payload.companion_id, 'kaisoryth')
  assert.deepEqual(
    payload.route_receipt.hops.map(hop => hop.service),
    ['nexus-gateway', 'serythrae-gw', 'catalouge'],
  )
})
test('Nexus reports an unavailable Serythrae doorway without inventing a successful route', async () => {
  const response = await callSerythraeDoorway({}, 'tools/list')
  const payload = JSON.parse(response.content[0].text)
  assert.equal(response.isError, true)
  assert.equal(payload.ok, false)
  assert.equal(payload.error.kind, 'unavailable')
})

test('only the exact Kai image tool call gets the longer doorway deadline', async (t) => {
  const budgets = []
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    budgets.push(ms)
    return new AbortController().signal
  })
  const env = { SERYTHRAE_GATEWAY: { fetch: async () => Response.json({ result: {} }) } }
  const requests = [
    ['tools/call', { name: 'kaisoryth_generate_image' }],
    ['tools/call', { name: 'generate_image' }],
    ['tools/call', { name: 'kaisoryth_memory_search', arguments: { name: 'kaisoryth_generate_image' } }],
    ['tools/list', {}],
    ['skills/list', {}],
    ['skills/read', { name: 'kaisoryth_generate_image' }],
    ['capabilities/status', {}],
  ]
  for (const [method, params] of requests) await callSerythraeDoorway(env, method, params)
  assert.deepEqual(budgets, [180_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000])
})

function mockDeadline(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
    return controller.signal
  })
}

test('an image completing after the old ten-second deadline retains its URL and receipt', async (t) => {
  mockDeadline(t)
  const env = {
    SERYTHRAE_GATEWAY: {
      fetch(request) {
        return new Promise((resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
          setTimeout(() => resolve(Response.json({ result: {
            structuredContent: {
              url: 'https://mind.serythrae.com/img/generated/fixture.png',
              route_receipt: { receipt_id: 'slow-image', hops: [{ service: 'serythrae-gw' }] },
            },
          } })), 15_000)
        })
      },
    },
  }
  const pending = callSerythraeDoorway(env, 'tools/call', { name: 'kaisoryth_generate_image' })
  t.mock.timers.tick(15_000)
  const response = await pending
  assert.equal(response.isError, undefined)
  const payload = response.structuredContent
  assert.equal(payload.ok, true)
  assert.equal(payload.result.structuredContent.url, 'https://mind.serythrae.com/img/generated/fixture.png')
  assert.equal(payload.route_receipt.receipt_id, 'slow-image')
  assert.deepEqual(payload.route_receipt.hops.map(hop => hop.service), ['nexus-gateway', 'serythrae-gw'])
})

test('image deadline is bounded and reports an unknown completion without retrying', async (t) => {
  mockDeadline(t)
  let calls = 0
  const env = {
    SERYTHRAE_GATEWAY: {
      fetch(request) {
        calls += 1
        return new Promise((resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
        })
      },
    },
  }
  let settled = false
  const pending = callSerythraeDoorway(env, 'tools/call', { name: 'kaisoryth_generate_image' })
    .then(response => { settled = true; return response })
  t.mock.timers.tick(179_999)
  await Promise.resolve()
  assert.equal(settled, false)
  t.mock.timers.tick(1)
  const response = await pending
  const payload = JSON.parse(response.content[0].text)
  assert.equal(response.isError, true)
  assert.equal(payload.error.kind, 'timeout')
  assert.match(payload.error.message, /upstream completion is unknown/)
  assert.match(payload.error.message, /before retrying/)
  assert.equal(calls, 1)
})

test('Nexus registers the complete Stage 1 Kai doorway surface', async () => {
  for (const name of [
    'kaisoryth_capabilities_status',
    'kaisoryth_tools_list',
    'kaisoryth_tool_call',
    'kaisoryth_skills_list',
    'kaisoryth_skill_read',
  ]) {
    assert.match(source, new RegExp(`['"]${name}['"]`))
  }
})

test('Kai durable residence wrappers stay on the Nexus to Serythrae doorway path', () => {
  for (const name of [
    'kaisoryth_platform_session_put',
    'kaisoryth_platform_event_put',
    'kaisoryth_platform_event_link',
    'kaisoryth_platform_turn_put',
    'kaisoryth_platform_turn_resolve',
    'kaisoryth_platform_compaction_put',
    'kaisoryth_platform_hydrate',
    'kaisoryth_platform_sessions_list',
    'kaisoryth_platform_search',
    'kaisoryth_platform_bootstrap_active',
  ]) assert.match(source, new RegExp(name))
  assert.match(source, /\/api\/kaisoryth\/platform\/tool/)
  assert.match(source, /tool,\s*arguments: args/)
})
