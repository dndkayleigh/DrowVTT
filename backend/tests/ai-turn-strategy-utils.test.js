import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AI_TURN_STRATEGY_ID,
  getAiTurnStrategy,
  resolveAiTurnRequest
} from '../../data/ai-turn-strategy-utils.mjs';

test('OSS AI turn strategies use the new single and group tactical mapping', () => {
  assert.equal(DEFAULT_AI_TURN_STRATEGY_ID, 'single_tactical');

  assert.deepEqual(getAiTurnStrategy('single_fast'), {
    id: 'single_fast',
    label: 'Single (Fast)',
    description: 'Lowest-latency speed mode for one monster taking a quick turn.',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  });

  assert.deepEqual(getAiTurnStrategy('single_tactical'), {
    id: 'single_tactical',
    label: 'Single (Tactical)',
    description: 'Highest-context tactical read for one monster taking a smarter turn.',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(getAiTurnStrategy('group_tactical'), {
    id: 'group_tactical',
    label: 'Group (Tactical)',
    description: 'Uses the strongest model and the full tactical packet for coordinated enemy turns.',
    model: 'gpt-5',
    packetVariant: 'full'
  });
});

test('OSS AI turn strategy aliases stay backward compatible', () => {
  assert.equal(getAiTurnStrategy('fast')?.id, 'single_fast');
  assert.equal(getAiTurnStrategy('full')?.id, 'single_tactical');
  assert.equal(getAiTurnStrategy('balanced')?.id, 'single_tactical');
  assert.equal(getAiTurnStrategy('strategy')?.id, 'group_tactical');
  assert.equal(getAiTurnStrategy('group_strategy')?.id, 'group_tactical');
});

test('resolveAiTurnRequest returns the expected model and packet for each tactical mode', () => {
  assert.deepEqual(resolveAiTurnRequest({ strategy: 'single_fast' }), {
    strategyId: 'single_fast',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'single_tactical' }), {
    strategyId: 'single_tactical',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'group_tactical' }), {
    strategyId: 'group_tactical',
    model: 'gpt-5',
    packetVariant: 'full'
  });
});
