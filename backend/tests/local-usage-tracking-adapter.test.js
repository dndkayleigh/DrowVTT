import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalUsageTrackingAdapter } from '../../data/local-usage-tracking-adapter.mjs';

test('local usage tracking adapter records invocation start and success result', () => {
  let idCounter = 0;
  const adapter = createLocalUsageTrackingAdapter({
    createId: () => `usage-${++idCounter}`,
    now: () => '2026-04-02T12:00:00.000Z'
  });

  const start = adapter.recordTacticsInvocationStart({
    requestId: 'req-1',
    strategyId: 'balanced',
    model: 'gpt-5',
    payloadBytes: 512
  });

  assert.equal(start.id, 'usage-1');
  assert.equal(start.status, 'started');

  adapter.recordTacticsInvocationResult({
    id: start.id,
    requestId: 'req-1',
    status: 'succeeded',
    strategyId: 'balanced',
    model: 'gpt-5',
    latencyMs: 1200,
    tokens: { input: 100, output: 20, total: 120 }
  });

  const [event] = adapter.getUsageEvents();
  assert.equal(event.id, 'usage-1');
  assert.equal(event.status, 'succeeded');
  assert.equal(event.latencyMs, 1200);
  assert.equal(event.tokens.total, 120);
});

test('local usage tracking adapter records failed results with normalized error output', () => {
  const adapter = createLocalUsageTrackingAdapter({
    createId: () => 'usage-1',
    now: () => '2026-04-02T12:00:00.000Z'
  });

  adapter.recordTacticsInvocationStart({
    requestId: 'req-2',
    strategyId: 'fast',
    model: 'gpt-5.4-mini',
    payloadBytes: 256
  });

  adapter.recordTacticsInvocationResult({
    id: 'usage-1',
    requestId: 'req-2',
    status: 'failed',
    strategyId: 'fast',
    model: 'gpt-5.4-mini',
    latencyMs: 250,
    error: new Error('Backend failed')
  });

  const [event] = adapter.getUsageEvents();
  assert.equal(event.status, 'failed');
  assert.equal(event.error, 'Error: Backend failed');
});

test('local usage tracking adapter updates existing started events instead of duplicating them', () => {
  const adapter = createLocalUsageTrackingAdapter({
    createId: () => 'usage-1',
    now: () => '2026-04-02T12:00:00.000Z'
  });

  const start = adapter.recordTacticsInvocationStart({
    requestId: 'req-3',
    strategyId: 'balanced',
    model: 'gpt-5.4'
  });

  adapter.recordTacticsInvocationResult({
    id: start.id,
    requestId: 'req-3',
    status: 'succeeded',
    latencyMs: 321
  });

  const events = adapter.getUsageEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'succeeded');
  assert.equal(events[0].latencyMs, 321);
});

test('local usage tracking adapter normalizes unknown statuses to failed', () => {
  const adapter = createLocalUsageTrackingAdapter({
    createId: () => 'usage-1',
    now: () => '2026-04-02T12:00:00.000Z'
  });

  adapter.recordTacticsInvocationResult({
    id: 'usage-1',
    requestId: 'req-4',
    status: 'mystery-status'
  });

  const [event] = adapter.getUsageEvents();
  assert.equal(event.status, 'failed');
});
