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
