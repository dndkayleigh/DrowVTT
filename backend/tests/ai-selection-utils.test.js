import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceAiSelectionForStrategy,
  getAiGroupTokenIds,
  getSelectedMonsterIds,
  setSelectedTokenIds,
  setSingleSelection,
  toggleTokenSelection
} from '../../data/ai-selection-utils.mjs';

const TOKENS = [
  { id: 'goblin-a', type: 'Monster' },
  { id: 'goblin-b', type: 'Monster' },
  { id: 'aria', type: 'PC' }
];

test('setSelectedTokenIds keeps only valid token ids and preserves order', () => {
  assert.deepEqual(
    setSelectedTokenIds(TOKENS, ['goblin-b', 'missing', 'goblin-a', 'goblin-b']),
    {
      selectedTokenIds: ['goblin-b', 'goblin-a'],
      selectedTokenId: 'goblin-b'
    }
  );
});

test('toggleTokenSelection adds and removes a valid token id', () => {
  assert.deepEqual(
    toggleTokenSelection(TOKENS, ['goblin-a'], 'goblin-b'),
    {
      selectedTokenIds: ['goblin-a', 'goblin-b'],
      selectedTokenId: 'goblin-a'
    }
  );

  assert.deepEqual(
    toggleTokenSelection(TOKENS, ['goblin-a', 'goblin-b'], 'goblin-a'),
    {
      selectedTokenIds: ['goblin-b'],
      selectedTokenId: 'goblin-b'
    }
  );
});

test('group selection keeps only selected monsters', () => {
  assert.deepEqual(getSelectedMonsterIds(TOKENS, ['goblin-a', 'aria', 'goblin-b']), ['goblin-a', 'goblin-b']);
  assert.deepEqual(getAiGroupTokenIds(TOKENS, ['aria', 'goblin-b']), ['goblin-b']);
});

test('single selection collapses to one token', () => {
  assert.deepEqual(
    setSingleSelection(TOKENS, 'goblin-b'),
    {
      selectedTokenIds: ['goblin-b'],
      selectedTokenId: 'goblin-b'
    }
  );
});

test('enforceAiSelectionForStrategy keeps multi-select for group tactical and collapses for single modes', () => {
  assert.deepEqual(
    enforceAiSelectionForStrategy(TOKENS, {
      strategyId: 'group_tactical',
      currentTurnTokenId: 'goblin-a',
      selectedTokenIds: ['goblin-a', 'goblin-b']
    }),
    {
      selectedTokenIds: ['goblin-a', 'goblin-b'],
      selectedTokenId: 'goblin-a'
    }
  );

  assert.deepEqual(
    enforceAiSelectionForStrategy(TOKENS, {
      strategyId: 'single_tactical',
      currentTurnTokenId: 'goblin-b',
      selectedTokenIds: ['goblin-a', 'goblin-b']
    }),
    {
      selectedTokenIds: ['goblin-b'],
      selectedTokenId: 'goblin-b'
    }
  );
});
