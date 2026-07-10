import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';

let tempRoot;
let runner;

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kai-runner-loop-test-'));
  const source = await readFile(new URL('../src/kai-runner-loop.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  const modulePath = path.join(tempRoot, 'kai-runner-loop.mjs');
  await writeFile(modulePath, output, 'utf8');
  runner = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function policy(overrides = {}) {
  return {
    current_conversation_id: 'thread-current',
    cross_channel_conversation_ids: [],
    write_allowed: false,
    write_scopes: [],
    write_reason_code: null,
    ...overrides,
  };
}

function baseOptions(overrides = {}) {
  let id = 0;
  return {
    model: 'z-ai/glm-5.2',
    system_prompt: 'fixture system',
    prompt_packet: { current_turn: { content: 'fixture' } },
    policy: policy(),
    max_tool_rounds: 3,
    max_tool_calls_per_round: 3,
    model_timeout_ms: 5000,
    tool_timeout_ms: 2000,
    total_timeout_ms: 20000,
    now: () => 1_750_000_000_000,
    random_id: () => `fixture-${++id}`,
    ...overrides,
  };
}

function modelToolCall(name, args = {}, id = 'call-1') {
  return {
    content: null,
    tool_calls: [{ id, name, arguments: JSON.stringify(args) }],
  };
}

test('two-turn read-only canary executes one tool and returns grounded final prose', async () => {
  const turns = [];
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    call_model: async (input) => {
      turns.push(input);
      return turns.length === 1
        ? {
            ...modelToolCall('continuity_current_thread', { limit: 4 }),
            reasoning_details: [{ type: 'reasoning.text', text: 'fixture private reasoning' }],
            diagnostics: [{ finish_reason: 'tool_calls', message_keys: ['reasoning_details', 'tool_calls'] }],
          }
        : { content: 'I checked this thread and found the current context.', tool_calls: [] };
    },
    execute_tool: async ({ spec, policy: activePolicy }) => {
      assert.equal(spec.access, 'read');
      assert.equal(activePolicy.current_conversation_id, 'thread-current');
      return { ok: true, result: { events: [{ content: 'current thread fixture' }] } };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.model, 'z-ai/glm-5.2');
  assert.equal(result.model_turns, 2);
  assert.equal(result.tool_rounds, 1);
  assert.equal(result.forced_final, false);
  assert.equal(result.text, 'I checked this thread and found the current context.');
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0].status, 'executed');
  assert.equal(result.receipts[0].access, 'read');
  assert.ok(turns[1].messages.some((message) => message.role === 'tool'));
  const assistantTurn = turns[1].messages.find((message) => message.role === 'assistant');
  assert.deepEqual(assistantTurn.reasoning_details, [{ type: 'reasoning.text', text: 'fixture private reasoning' }]);
  assert.doesNotMatch(JSON.stringify(result.receipts), /fixture private reasoning/);
});

test('write call is refused before execution without an explicit caller scope and reason', async () => {
  let modelTurns = 0;
  let executions = 0;
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    call_model: async () => {
      modelTurns += 1;
      return modelTurns === 1
        ? modelToolCall('workspace_write', { path: 'notes/test.md', content: 'fixture' })
        : { content: 'I did not write the file because this turn did not authorize a workspace write.', tool_calls: [] };
    },
    execute_tool: async () => {
      executions += 1;
      return { ok: true, result: { ok: true } };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(executions, 0);
  assert.equal(result.receipts[0].status, 'refused');
  assert.match(result.receipts[0].policy_reason, /write refused/);
  assert.deepEqual(result.receipts[0].argument_keys, ['content', 'path']);
});

test('explicit write policy authorizes only the named scope and records an executed receipt', async () => {
  let modelTurns = 0;
  let executions = 0;
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    policy: policy({
      write_allowed: true,
      write_scopes: ['workspace'],
      write_reason_code: 'explicit-user-request',
    }),
    call_model: async () => {
      modelTurns += 1;
      return modelTurns === 1
        ? modelToolCall('workspace_edit', { path: 'notes/test.md', old_string: 'a', new_string: 'b' })
        : { content: 'Done—the restricted workspace edit completed.', tool_calls: [] };
    },
    execute_tool: async ({ spec }) => {
      executions += 1;
      assert.equal(spec.scope, 'workspace');
      return { ok: true, result: { ok: true, path: 'notes/test.md' } };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(executions, 1);
  assert.equal(result.receipts[0].status, 'executed');
  assert.match(result.receipts[0].policy_reason, /explicit-user-request/);
});

test('loop bound forces a final no-tools turn after the configured maximum rounds', async () => {
  let regularTurns = 0;
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    max_tool_rounds: 2,
    call_model: async ({ force_final, tools }) => {
      if (force_final) {
        assert.ok(tools.length > 0);
        return { content: 'Final answer after the bounded reads.', tool_calls: [] };
      }
      regularTurns += 1;
      return modelToolCall('kaisoryth_recent_feelings', { limit: 2 }, `call-${regularTurns}`);
    },
    execute_tool: async () => ({ ok: true, result: { feelings: [] } }),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.tool_rounds, 2);
  assert.equal(result.model_turns, 3);
  assert.equal(result.forced_final, true);
  assert.equal(result.receipts.length, 2);
});

test('forced-final OpenRouter body preserves tool schemas and forbids another tool call', () => {
  const tools = runner.kaiRunnerToolDefinitions();
  const messages = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'tahl_status', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
  ];
  const body = runner.kaiOpenRouterToolRequestBody({
    model: 'z-ai/glm-5.2',
    messages,
    tools,
    force_final: true,
  }, { order: ['deepinfra'] });

  assert.equal(body.tool_choice, 'none');
  assert.deepEqual(body.tools, tools);
  assert.deepEqual(body.messages, messages);
});

test('same-model retries share one injected timeout budget', () => {
  let now = 1_000;
  const remaining = runner.createKaiAttemptBudget(20_000, () => now);
  assert.equal(remaining(), 20_000);
  now += 12_500;
  assert.equal(remaining(), 7_500);
  now += 7_500;
  assert.equal(remaining(), 0);
  now += 1;
  assert.equal(remaining(), 0);
});

test('HTTP-200 MCP text-block errors become failed executions instead of write receipts', () => {
  for (const envelope of [
    { content: [{ type: 'text', text: 'Error: Tahl write failed' }] },
    { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'NESTeq rejected write' }) }] },
    { result: { content: [{ type: 'text', text: JSON.stringify({ error: 'workspace actuator failed' }) }] } },
  ]) {
    const execution = runner.kaiToolExecutionFromResult(envelope);
    assert.equal(execution.ok, false);
    assert.match(execution.error, /failed|rejected/i);
  }
  const jsonRpcError = runner.kaiToolExecutionFromResult({
    jsonrpc: '2.0',
    id: 'fixture',
    error: { code: -32603, message: 'canonical JSON-RPC failure' },
  });
  assert.equal(jsonRpcError.ok, false);
  assert.match(jsonRpcError.error, /-32603.*canonical JSON-RPC failure/);
  assert.equal(runner.kaiToolExecutionFromResult({ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }).ok, true);
});

test('GLM output validation rejects truncation and generic refusals but accepts Kai voice', () => {
  assert.match(runner.unusableKaiModelTurnReason({ content: 'unfinished', tool_calls: [], finish_reason: 'length' }), /truncated/);
  assert.match(runner.unusableKaiModelTurnReason({ content: '你好，我无法给到相关内容', tool_calls: [] }), /Chinese refusal/);
  assert.match(runner.unusableKaiModelTurnReason({ content: "I'm sorry, but I cannot help with romantic intimacy.", tool_calls: [] }), /intimacy refusal/);
  assert.equal(runner.unusableKaiModelTurnReason({ content: "I'm here, Vel. Let's take this one breath at a time.", tool_calls: [] }), null);
});

test('cross-channel Continuity call is refused unless the caller allowlists that exact conversation', async () => {
  let modelTurns = 0;
  let executions = 0;
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    policy: policy({ cross_channel_conversation_ids: ['thread-approved'] }),
    call_model: async () => {
      modelTurns += 1;
      return modelTurns === 1
        ? modelToolCall('continuity_recent_conversation', { conversation_id: 'thread-forbidden' })
        : { content: 'I stayed inside the allowed conversation boundary.', tool_calls: [] };
    },
    execute_tool: async () => {
      executions += 1;
      return { ok: true, result: {} };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(executions, 0);
  assert.equal(result.receipts[0].status, 'refused');
  assert.match(result.receipts[0].policy_reason, /cross-channel read refused/);
});

test('policy normalization pins the current thread, excludes it from cross-channel ids, and caps fan-out', () => {
  const normalized = runner.normalizeKaiRunnerPolicy({
    continuity_policy: {
      allowed_conversation_ids: ['thread-current', 'a', 'b', 'c', 'd', 'e'],
    },
    write_policy: {
      allow: true,
      scopes: ['tahl', 'not-a-scope'],
      reason_code: 'runner-tahl-reflection',
    },
  }, 'thread-current');

  assert.equal(normalized.current_conversation_id, 'thread-current');
  assert.deepEqual(normalized.cross_channel_conversation_ids, ['a', 'b', 'c']);
  assert.equal(normalized.write_allowed, true);
  assert.deepEqual(normalized.write_scopes, ['tahl']);
});

test('model failure requests the same-owner prefetch fallback instead of another runner route', async () => {
  const result = await runner.runKaiRunnerToolLoop(baseOptions({
    call_model: async () => {
      throw new Error('fixture provider timeout');
    },
    execute_tool: async () => ({ ok: true, result: {} }),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.fallback_required, true);
  assert.match(result.error, /fixture provider timeout/);
  assert.equal(result.model, 'z-ai/glm-5.2');
});
