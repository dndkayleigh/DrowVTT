import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTurnEditorToToken,
  buildTokenRowState,
  buildTokenContextMenuState,
  buildTokenSelectionNote,
  buildTurnDropdownState,
  buildTurnEditorState,
  DEFAULT_AI_TURN_STRATEGY_ID,
  getAiTurnStrategy,
  getVttUiSharedStatus,
  moveTokenToCell,
  renderOssVttShell,
  resolveAiStrategyIdForSelection,
  validateTokenMove
} from '../../packages/vtt-ui-shared/src/index.js';

test('shared VTT UI package exposes tactical interaction modules', () => {
  assert.deepEqual(getVttUiSharedStatus(), {
    phase: 'shell-markup-tactical-and-runtime-modules',
    sourceOfTruth: 'oss',
    intendedConsumers: ['oss', 'saas']
  });

  assert.equal(DEFAULT_AI_TURN_STRATEGY_ID, 'single_tactical');
  assert.equal(getAiTurnStrategy('group_tactical')?.model, 'gpt-5');
  assert.equal(resolveAiStrategyIdForSelection('single_fast', ['a', 'b']), 'group_tactical');
  assert.match(renderOssVttShell(), /<div class="app">/);
  assert.match(renderOssVttShell(), /id="aiDrawer"/);
});

test('shared VTT shell supports host-specific sidebar and settings seams', () => {
  const html = renderOssVttShell({
    showApiEndpoint: false,
    sidebarAfterBrandHtml: '<section id="hostAccountCard">Hosted account</section>'
  });

  assert.match(html, /id="hostAccountCard"/);
  assert.doesNotMatch(html, /id="apiUrl"/);
  assert.match(html, /id="aiStrategy"/);
});

test('shared VTT runtime helpers expose selection note and context menu state', () => {
  assert.equal(
    buildTokenSelectionNote({
      strategyId: 'group_tactical',
      strategyLabel: 'Group (Tactical)',
      groupCount: 2
    }),
    'Group (Tactical) will use 2 grouped AI-controlled tokens. Use Pick or ctrl/cmd-click eligible tokens, then click Set Group From Selection.'
  );

  assert.deepEqual(
    buildTokenContextMenuState(
      { id: 'g1', art: { src: 'hero.png' } },
      { clientX: 900, clientY: 700, viewportWidth: 1024, viewportHeight: 768 }
    ),
    {
      tokenId: 'g1',
      addArtLabel: 'Edit art',
      clearArtDisabled: false,
      left: 824,
      top: 666
    }
  );
});

test('shared VTT runtime helpers validate and apply token movement', () => {
  const tokens = [
    { id: 'm1', name: 'Ghoul', type: 'Monster', speed: 30, sizeCells: 1, x: 32, y: 32 },
    { id: 'p1', name: 'Lyra', type: 'PC', speed: 30, sizeCells: 1, x: 96, y: 32 }
  ];
  const gridCoords = (token) => ({ x: Math.floor(token.x / 64), y: Math.floor(token.y / 64) });
  const cellsOccupiedAt = (x, y, sizeCells) => {
    const cells = [];
    for (let row = 0; row < sizeCells; row += 1) {
      for (let col = 0; col < sizeCells; col += 1) {
        cells.push({ x: x + col, y: y + row });
      }
    }
    return cells;
  };
  const chebyshevDistanceCells = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const blocked = validateTokenMove({
    token: tokens[0],
    toCell: { x: 1, y: 0 },
    tokens,
    isTokenControlledThisTurn: () => true,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /space is occupied by Lyra/);

  const events = [];
  const moved = moveTokenToCell({
    token: tokens[0],
    cell: { x: 0, y: 1 },
    validateMove: (token, cell, options) => validateTokenMove({
      token,
      toCell: cell,
      tokens,
      isTokenControlledThisTurn: () => true,
      gridCoords,
      chebyshevDistanceCells,
      cellsOccupiedAt
    }, options),
    centerFromGridCell: (x, y) => ({ x: (x * 64) + 32, y: (y * 64) + 32 }),
    onMoved: (payload) => events.push(payload)
  });

  assert.equal(moved.ok, true);
  assert.deepEqual(gridCoords(tokens[0]), { x: 0, y: 1 });
  assert.deepEqual(events, [
    {
      tokenId: 'm1',
      name: 'Ghoul',
      toCell: { x: 0, y: 1 },
      source: 'move'
    }
  ]);
});

test('shared VTT runtime helpers expose token-row, turn-dropdown, and editor state', () => {
  const token = {
    id: 'm1',
    name: 'Ghoul',
    type: 'Monster',
    hp: '22/22',
    sizeCells: 1,
    art: { src: 'ghoul.png' },
    statblock: 'Ghoul statblock',
    ac: 12,
    speed: 30,
    color: '#ff5a7a',
    notes: 'Hungry',
    x: 32,
    y: 32
  };

  assert.deepEqual(
    buildTokenRowState(token, {
      gridCell: { x: 4, y: 5 },
      isSelected: true,
      isGrouped: true,
      isCurrentTurn: true,
      canPickForGroup: true,
      strategyId: 'group_tactical'
    }),
    {
      title: 'Ghoul statblock',
      rowClasses: { selected: true, grouped: true },
      metaText: 'Monster • HP 22/22 • 1×1 • (4,5) • Grouped • Art',
      turnButton: { text: 'Turn', primary: true },
      pickButton: { text: 'Picked', primary: true, disabled: false }
    }
  );

  assert.deepEqual(
    buildTurnDropdownState({
      tokens: [
        { id: 'm1', type: 'Monster', name: 'Ghoul' },
        { id: 'p1', type: 'PC', name: 'Lyra' }
      ],
      controllableIds: ['m1'],
      currentTokenId: 'm1',
      currentToken: { id: 'm1', type: 'Monster', name: 'Ghoul' },
      resolvedCurrentId: 'm1'
    }),
    {
      options: [{ value: 'm1', label: 'Monster: Ghoul' }],
      value: 'm1',
      currentTurnTokenId: 'm1'
    }
  );

  assert.deepEqual(
    buildTurnEditorState(token, { normalizeSizeCells: (value) => Number(value) }),
    {
      disabled: false,
      values: {
        ac: 12,
        hp: '22/22',
        size: '1',
        color: '#ff5a7a',
        speed: 30,
        notes: 'Hungry',
        statblock: 'Ghoul statblock'
      }
    }
  );

  const edited = { ...token };
  applyTurnEditorToToken(edited, {
    ac: '15',
    hp: '19/22',
    size: '2',
    color: '#5aa9ff',
    speed: '40',
    notes: 'Repositioned',
    statblock: 'Updated statblock'
  }, {
    normalizeSizeCells: (value) => Number(value),
    gridCoords: () => ({ x: 1, y: 2 }),
    centerFromGridCell: (x, y, sizeCells) => ({ x: x * 64 + (sizeCells * 16), y: y * 64 + (sizeCells * 16) })
  });
  assert.equal(edited.ac, 15);
  assert.equal(edited.hp, '19/22');
  assert.equal(edited.sizeCells, 2);
  assert.equal(edited.color, '#5aa9ff');
  assert.equal(edited.speed, 40);
  assert.equal(edited.notes, 'Repositioned');
  assert.equal(edited.statblock, 'Updated statblock');
});
