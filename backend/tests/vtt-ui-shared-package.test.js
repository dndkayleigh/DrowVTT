import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTokenContextMenuState,
  buildTokenSelectionNote,
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
