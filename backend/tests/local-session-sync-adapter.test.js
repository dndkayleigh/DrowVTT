import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSessionSyncAdapter } from '../../data/local-session-sync-adapter.mjs';

test('local session sync adapter publishes events in order to subscribers', () => {
  let idCounter = 0;
  const adapter = createLocalSessionSyncAdapter({
    createId: () => `event-${++idCounter}`,
    now: () => '2026-04-02T12:00:00.000Z'
  });

  adapter.connect('session-1', { userId: 'local-user' });

  const seen = [];
  const unsubscribe = adapter.subscribeToBoardEvents((event) => {
    seen.push(event.type);
  });

  adapter.publishBoardEvent({ type: 'token.created', payload: { tokenId: 'a' } });
  adapter.publishBoardEvent({ type: 'turn.changed', payload: { currentTurnTokenId: 'a' } });
  unsubscribe();

  assert.deepEqual(seen, ['token.created', 'turn.changed']);
  assert.deepEqual(adapter.getPublishedEvents().map((event) => event.sequence), [1, 2]);
});

test('local session sync adapter rejects unsupported board event types', () => {
  const adapter = createLocalSessionSyncAdapter({
    createId: () => 'event-1',
    now: () => '2026-04-02T12:00:00.000Z'
  });

  adapter.connect('session-1', { userId: 'local-user' });

  assert.throws(() => {
    adapter.publishBoardEvent({ type: 'token.teleported', payload: {} });
  }, /Unsupported board event type/);
});
