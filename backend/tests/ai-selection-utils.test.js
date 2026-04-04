import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceAiSelectionForStrategy,
  getAiControllableTokenIds,
  getAiGroupTokenIds,
  getSelectedAiControlledIds,
  getSelectedMonsterIds,
  isAiTurnActorAllowed,
  isAiControllableToken,
  resolveAiCurrentTurnTokenId,
  resolveAiStrategyIdForSelection,
  setSelectedTokenIds,
  setSingleSelection,
  toggleAiControlledSelection,
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

test('toggleAiControlledSelection drops non-AI selections before building a group', () => {
  assert.deepEqual(
    toggleAiControlledSelection(TOKENS, ['aria'], 'goblin-a', 'Monsters'),
    {
      selectedTokenIds: ['goblin-a'],
      selectedTokenId: 'goblin-a'
    }
  );

  assert.deepEqual(
    toggleAiControlledSelection(TOKENS, ['goblin-a'], 'goblin-b', 'Monsters'),
    {
      selectedTokenIds: ['goblin-a', 'goblin-b'],
      selectedTokenId: 'goblin-a'
    }
  );

  assert.deepEqual(
    toggleAiControlledSelection(TOKENS, ['aria', 'goblin-a'], 'goblin-b', 'Monsters'),
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

test('AI controls filter which token types can be grouped', () => {
  assert.equal(isAiControllableToken({ type: 'Monster' }, 'Monsters'), true);
  assert.equal(isAiControllableToken({ type: 'PC' }, 'Monsters'), false);
  assert.equal(isAiControllableToken({ type: 'NPC' }, 'PCs'), true);
  assert.equal(isAiControllableToken({ type: 'Monster' }, 'PCs'), false);
  assert.equal(isAiControllableToken({ type: 'PC' }, 'Both'), true);
  assert.equal(isAiControllableToken({ type: 'Monster' }, 'None'), false);

  assert.deepEqual(
    getSelectedAiControlledIds(TOKENS, ['goblin-a', 'aria'], 'Monsters'),
    ['goblin-a']
  );
  assert.deepEqual(
    getSelectedAiControlledIds(TOKENS, ['goblin-a', 'aria'], 'PCs'),
    ['aria']
  );
  assert.deepEqual(
    getAiGroupTokenIds(TOKENS, ['goblin-a', 'aria'], 'Both'),
    ['goblin-a', 'aria']
  );
  assert.deepEqual(getAiControllableTokenIds(TOKENS, 'Monsters'), ['goblin-a', 'goblin-b']);
  assert.deepEqual(getAiControllableTokenIds(TOKENS, 'PCs'), ['aria']);
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

test('resolveAiCurrentTurnTokenId keeps current token inside AI controls scope', () => {
  assert.equal(
    resolveAiCurrentTurnTokenId(TOKENS, {
      aiControls: 'Monsters',
      currentTurnTokenId: 'goblin-a',
      preferredTokenIds: ['goblin-b']
    }),
    'goblin-b'
  );

  assert.equal(
    resolveAiCurrentTurnTokenId(TOKENS, {
      aiControls: 'Monsters',
      currentTurnTokenId: 'aria',
      preferredTokenIds: ['aria', 'goblin-b']
    }),
    'goblin-b'
  );

  assert.equal(
    resolveAiCurrentTurnTokenId(TOKENS, {
      aiControls: 'PCs',
      currentTurnTokenId: 'goblin-a',
      preferredTokenIds: ['goblin-a']
    }),
    'aria'
  );

  assert.equal(
    resolveAiCurrentTurnTokenId(TOKENS, {
      aiControls: 'None',
      currentTurnTokenId: 'goblin-a',
      preferredTokenIds: ['goblin-a']
    }),
    null
  );
});

test('resolveAiStrategyIdForSelection switches to group tactical only for multi-select', () => {
  assert.equal(resolveAiStrategyIdForSelection('single_tactical', ['goblin-a']), 'single_tactical');
  assert.equal(resolveAiStrategyIdForSelection('single_fast', ['goblin-a', 'goblin-b']), 'group_tactical');
  assert.equal(resolveAiStrategyIdForSelection('group_tactical', ['goblin-a', 'goblin-b']), 'group_tactical');
});

test('isAiTurnActorAllowed allows grouped actors during group tactical turns', () => {
  assert.equal(isAiTurnActorAllowed({
    strategyId: 'single_tactical',
    tokenId: 'goblin-b',
    currentTurnTokenId: 'goblin-a',
    aiGroupTokenIds: ['goblin-a', 'goblin-b']
  }), false);

  assert.equal(isAiTurnActorAllowed({
    strategyId: 'group_tactical',
    tokenId: 'goblin-b',
    currentTurnTokenId: 'goblin-a',
    aiGroupTokenIds: ['goblin-a', 'goblin-b']
  }), true);

  assert.equal(isAiTurnActorAllowed({
    strategyId: 'group_tactical',
    tokenId: 'goblin-a',
    currentTurnTokenId: 'goblin-a',
    aiGroupTokenIds: []
  }), true);
});
