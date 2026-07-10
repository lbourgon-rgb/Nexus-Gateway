import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { test } from 'node:test';

const source = await readFile(new URL('../src/vel-preflight.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("import './env';", '');
const { buildVelPreflightContext } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const MARKER = '__latest_receipt__';

function fixtureDb(rows, onQuery = () => {}) {
  return {
    prepare(sql) {
      onQuery(sql);
      return {
        bind(...types) {
          return {
            async all() {
              return { results: rows.filter(row => row.type === MARKER || types.includes(row.type)) };
            },
          };
        },
      };
    },
  };
}

function sqliteD1Adapter(database) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return { async all() { return { results: database.prepare(sql).all(...values) }; } };
        },
      };
    },
  };
}

test('missing or invalid server-derived authority never queries PulseSync', async () => {
  let queries = 0;
  const env = { PULSESYNC_DB: { prepare() { queries += 1; throw new Error('must not query'); } } };
  for (const verification of [null, '', 'unverified', 'caller-supplied-label']) {
    const result = await buildVelPreflightContext(env, { verification });
    assert.equal(result.queried, false);
    assert.equal(result.source, 'not_queried');
    assert.equal(result.capacity.state, 'withheld');
  }
  assert.equal(queries, 0);
});

test('authorized Vel context returns current pacing flags without raw health values', async () => {
  let queries = 0;
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const rows = [
    { type: 'subjective.spoons', value: 2, start_ts: now - 1000, received_at: now - 1000 },
    { type: 'subjective.dailyDemands', value: 9, start_ts: now - 2000, received_at: now - 2000 },
    { type: 'subjective.cycleDay', value: 2, start_ts: now - 3000, received_at: now - 3000 },
    { type: MARKER, value: null, start_ts: null, received_at: now - 500 },
  ];
  const result = await buildVelPreflightContext({
    PULSESYNC_DB: fixtureDb(rows, () => { queries += 1; }),
  }, {
    verification: 'discord-owner-registry',
    include_cycle: true,
  }, now);
  assert.equal(queries, 1);
  assert.equal(result.queried, true);
  assert.equal(result.source, 'pulsesync');
  assert.equal(result.verification, 'discord-owner-registry');
  assert.equal(result.freshness.state, 'fresh');
  assert.equal(result.capacity.state, 'low');
  assert.equal(result.capacity.basis_freshness.spoons.state, 'fresh');
  assert.deepEqual(result.optional_context.cycle, 'early_days');
  assert.equal(result.privacy.raw_values_included, false);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"value"|heartRate|oxygenSaturation|restingHeartRate/);
});

test('a fresh unrelated receipt cannot make stale subjective capacity current', async () => {
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const staleAt = now - (25 * 60 * 60 * 1000);
  const result = await buildVelPreflightContext({
    PULSESYNC_DB: fixtureDb([
      { type: 'subjective.spoons', value: 8, start_ts: staleAt, received_at: staleAt },
      { type: 'subjective.dailyDemands', value: 9, start_ts: staleAt, received_at: staleAt },
      { type: MARKER, value: null, start_ts: null, received_at: now - 1000 },
    ]),
  }, { verification: 'codex-local-user-session' }, now);
  assert.equal(result.freshness.state, 'fresh');
  assert.equal(result.capacity.basis_freshness.spoons.state, 'stale');
  assert.equal(result.capacity.basis_freshness.daily_demands.state, 'stale');
  assert.equal(result.capacity.state, 'unknown');
  assert.deepEqual(result.capacity.pacing, ['respond_to_message_only']);
});

test('cycle data is not queried unless the authorized caller explicitly opts in', async () => {
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  let observedSql = '';
  const result = await buildVelPreflightContext({
    PULSESYNC_DB: fixtureDb([
      { type: 'subjective.spoons', value: 6, start_ts: now - 1000, received_at: now - 1000 },
      { type: MARKER, value: null, start_ts: null, received_at: now - 500 },
    ], sql => { observedSql = sql; }),
  }, { verification: 'haven-authenticated-owner', include_cycle: false }, now);
  assert.doesNotMatch(observedSql, /subjective\.cycleDay/);
  assert.equal('optional_context' in result, false);
});

test('stale cycle context is withheld even when another receipt is fresh', async () => {
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const staleAt = now - (25 * 60 * 60 * 1000);
  const result = await buildVelPreflightContext({
    PULSESYNC_DB: fixtureDb([
      { type: 'subjective.spoons', value: 6, start_ts: now - 1000, received_at: now - 1000 },
      { type: 'subjective.cycleDay', value: 2, start_ts: staleAt, received_at: staleAt },
      { type: MARKER, value: null, start_ts: null, received_at: now - 500 },
    ]),
  }, { verification: 'workspace-agent-owner-session', include_cycle: true }, now);
  assert.equal(result.optional_context.cycle, 'unavailable');
  assert.equal(result.optional_context.freshness.state, 'stale');
});

test('latest-per-type SQL cannot crowd out a less noisy subjective type', async () => {
  const now = Date.parse('2026-07-10T01:00:00.000Z');
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE samples (type TEXT NOT NULL, value REAL, start_ts INTEGER NOT NULL, received_at INTEGER NOT NULL)');
  const insert = database.prepare('INSERT INTO samples (type,value,start_ts,received_at) VALUES (?,?,?,?)');
  for (let index = 0; index < 40; index += 1) {
    insert.run('subjective.spoons', 8, now - index, now - index);
  }
  insert.run('subjective.dailyDemands', 9, now - 2000, now - 2000);
  const result = await buildVelPreflightContext({ PULSESYNC_DB: sqliteD1Adapter(database) }, {
    verification: 'grok-local-user-session',
  }, now);
  database.close();
  assert.equal(result.capacity.state, 'available');
  assert.equal(result.capacity.basis_freshness.daily_demands.state, 'fresh');
  assert.ok(result.capacity.pacing.includes('avoid_optional_tasks'));
});
