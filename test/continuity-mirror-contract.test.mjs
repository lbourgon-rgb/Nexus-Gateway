import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/tools/continuity.ts', import.meta.url), 'utf8')

test('Nexus exposes the filtered mirror export, bootstrap, and ack contract', () => {
  assert.match(source, /server\.tool\('continuity_mirror_export'/)
  assert.match(source, /companion_id: z\.string\(\)\.optional\(\)/)
  assert.match(source, /source: z\.string\(\)\.optional\(\)/)
  assert.match(source, /server\.tool\('continuity_mirror_bootstrap'/)
  assert.match(source, /server\.tool\('continuity_mirror_ack'/)
  assert.match(source, /'\/mirror\/bootstrap'/)
  assert.match(source, /'\/mirror\/ack'/)
})
