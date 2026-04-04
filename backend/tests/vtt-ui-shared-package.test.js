import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AI_TURN_STRATEGY_ID,
  getAiTurnStrategy,
  getVttUiSharedStatus,
  resolveAiStrategyIdForSelection
} from '../../packages/vtt-ui-shared/src/index.js';

test('shared VTT UI package exposes tactical interaction modules', () => {
  assert.deepEqual(getVttUiSharedStatus(), {
    phase: 'initial-tactical-modules',
    sourceOfTruth: 'oss',
    intendedConsumers: ['oss', 'saas']
  });

  assert.equal(DEFAULT_AI_TURN_STRATEGY_ID, 'single_tactical');
  assert.equal(getAiTurnStrategy('group_tactical')?.model, 'gpt-5');
  assert.equal(resolveAiStrategyIdForSelection('single_fast', ['a', 'b']), 'group_tactical');
});
