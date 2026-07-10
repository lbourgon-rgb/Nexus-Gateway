import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { test } from 'node:test';

const source = await readFile(new URL('../src/vel-preflight.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("import './env';", '');
const { buildVelPreflightContext } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('non-Vel and unverified authors never query PulseSync', async () => {
  let queries = 0;
  const env = { PULSESYNC_DB: { prepare() { queries += 1; throw new Error('must not query'); } } };
  for (const request of [
    { author_is_vel: false, verification: 'discord-owner-registry', surface: 'discord' },
    { author_is_vel: true, verification: 'unverified', surface: 'discord' },
  ]) {
    const result = await buildVelPreflightContext(env, request);
    assert.equal(result.queried, false);
    assert.equal(result.source, 'not_queried');
    assert.equal(result.capacity.state, 'withheld');
  }
  assert.equal(queries, 0);
});

test('verified Vel context returns pacing flags without raw health values', async () => {
  let queries = 0;
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const rows = [
    { type: 'subjective.spoons', value: 2, start_ts: now - 1000, received_at: now - 1000 },
    { type: 'subjective.dailyDemands', value: 9, start_ts: now - 2000, received_at: now - 2000 },
    { type: 'subjective.cycleDay', value: 2, start_ts: now - 3000, received_at: now - 3000 },
  ];
  const env = {
    PULSESYNC_DB: {
      prepare() {
        queries += 1;
        return { async all() { return { results: rows }; } };
      },
    },
  };
  const result = await buildVelPreflightContext(env, {
    author_is_vel: true,
    verification: 'discord-owner-registry',
    surface: 'discord',
    include_cycle: true,
  }, now);
  assert.equal(queries, 1);
  assert.equal(result.queried, true);
  assert.equal(result.source, 'pulsesync');
  assert.equal(result.freshness.state, 'fresh');
  assert.equal(result.capacity.state, 'low');
  assert.deepEqual(result.optional_context.cycle, 'early_days');
  assert.equal(result.privacy.raw_values_included, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"value"|heartRate|oxygenSaturation|restingHeartRate/);
});

test('stale receipts do not assert a current capacity state', async () => {
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const env = {
    PULSESYNC_DB: {
      prepare() {
        return { async all() { return { results: [{ type: 'subjective.spoons', value: 8, start_ts: now - 90000000, received_at: now - 90000000 }] }; } };
      },
    },
  };
  const result = await buildVelPreflightContext(env, {
    author_is_vel: true,
    verification: 'codex-local-user-session',
    surface: 'codex',
  }, now);
  assert.equal(result.freshness.state, 'stale');
  assert.equal(result.capacity.state, 'unknown');
  assert.deepEqual(result.capacity.pacing, ['respond_to_message_only']);
});
