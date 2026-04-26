import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCanvasContextMenuTarget,
  computeCanvasMouseDownIntent,
  computeAiGroupAssignment,
  computeAiControlsState,
  computeCurrentTurnSelectionState,
  computeTokenListInteraction,
  applyTurnEditorToToken,
  buildTokenRowState,
  buildTokenContextMenuState,
  buildTokenSelectionNote,
  buildTurnDropdownState,
  buildTurnEditorState,
  clampFloatingAIDrawerPosition,
  DEFAULT_AI_TURN_STRATEGY_ID,
  getAiTurnStrategy,
  getVttUiSharedStatus,
  moveTokenToCell,
  normalizeMonsterName,
  sizeCellsFromSrdSize,
  createSrdMonstersByName,
  findBlockedLineCrossing,
  resolveSrdMonsterTemplate,
  topMonsterMatches,
  SRD_MONSTERS,
  findOpenSpawnCell,
  findVisibleSpawnCell,
  renderOssVttShell,
  resolveDragComplete,
  resolveAiStrategyIdForSelection,
  shouldFloatAIDrawer,
  validateTokenMove
} from '../../packages/vtt-ui-shared/src/index.js';
import {
  getAiGroupTokenIds,
  getSelectedAiControlledIds,
  isAiControllableToken,
  resolveAiCurrentTurnTokenId,
  setSelectedTokenIds,
  setSingleSelection,
  toggleTokenSelection
} from '../../packages/vtt-ui-shared/src/ai-selection-utils.js';

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
  assert.match(renderOssVttShell(), /class="leftRail"/);
  assert.match(renderOssVttShell(), /id="contextDrawer"/);
  assert.match(renderOssVttShell(), /data-sidebar-section-target="map"/);
  assert.match(renderOssVttShell(), /id="sessionSection"/);
  assert.match(renderOssVttShell(), /data-sidebar-section-target="ai"/);
  assert.match(renderOssVttShell(), /id="aiSection"/);
  assert.match(renderOssVttShell(), /value="controller_human"/);
  assert.match(renderOssVttShell(), /value="controller_scripted"/);
  assert.match(renderOssVttShell(), /value="controller_utility"/);
  assert.doesNotMatch(renderOssVttShell(), /data-sidebar-section-target="save"/);
  assert.match(renderOssVttShell(), /id="mobileGroupSelectBtn"/);
  assert.match(renderOssVttShell(), /id="mobileCanvasToolbar"/);
  assert.match(renderOssVttShell(), /id="mobileCanvasNavigateBtn"/);
  assert.match(renderOssVttShell(), /id="mobileCanvasMoveBtn"/);
  assert.match(renderOssVttShell(), /class="stageWatermark"/);
  assert.match(renderOssVttShell(), />Tactics</);
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

test('shared VTT package exports SRD monster helpers, SRD data, and spawn helpers', () => {
  assert.equal(normalizeMonsterName('  Goblin A  '), 'goblin a');
  assert.equal(sizeCellsFromSrdSize('Large'), 2);
  assert.ok(Array.isArray(SRD_MONSTERS));
  assert.ok(SRD_MONSTERS.length > 100);

  const monstersByName = createSrdMonstersByName(SRD_MONSTERS);
  assert.equal(resolveSrdMonsterTemplate('Goblin', monstersByName)?.name, 'Goblin');
  assert.equal(topMonsterMatches(SRD_MONSTERS, 'gob', 1)[0]?.name, 'Goblin');

  assert.deepEqual(
    findOpenSpawnCell({ x: 0, y: 0 }, 1, (x, y) => x === 1 && y === 0),
    { x: 1, y: 0 }
  );

  assert.deepEqual(
    findVisibleSpawnCell({
      sizeCells: 1,
      screenToWorld: (x, y) => ({ x, y }),
      gridCellFromWorldPoint: (x, y) => ({ x: Math.floor(x / 64), y: Math.floor(y / 64) }),
      canPlaceTokenAtCell: (x, y) => x === 2 && y === 1,
      preferredScreenPoint: { x: 70, y: 70 }
    }),
    { x: 2, y: 1 }
  );
});

test('shared VTT runtime helpers expose selection note and context menu state', () => {
  assert.equal(
    buildTokenSelectionNote({
      strategyId: 'group_tactical',
      strategyLabel: 'Group (Tactical)',
      groupCount: 2
    }),
    'Group (Tactical) will use 2 grouped AI-controlled tokens. Use ctrl/cmd-click on desktop or Group Select on mobile to build the group.'
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

test('shared VTT runtime helpers expose floating drawer rules', () => {
  assert.equal(shouldFloatAIDrawer(901), true);
  assert.equal(shouldFloatAIDrawer(900), false);
  assert.deepEqual(
    clampFloatingAIDrawerPosition({
      left: 900,
      top: 700,
      viewportWidth: 1024,
      viewportHeight: 768,
      drawerWidth: 440,
      drawerHeight: 320
    }),
    {
      left: 574,
      top: 438
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

  tokens[0].x = 96;
  tokens[0].y = 32;
  const dragBlocked = validateTokenMove({
    token: tokens[0],
    toCell: { x: 1, y: 0 },
    tokens,
    isTokenControlledThisTurn: () => true,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt
  }, {
    fromCell: { x: 0, y: 0 }
  });
  assert.equal(dragBlocked.ok, false);
  assert.match(dragBlocked.reason, /space is occupied by Lyra/);

  const manualDragAllowed = validateTokenMove({
    token: tokens[0],
    toCell: { x: 1, y: 0 },
    tokens,
    isTokenControlledThisTurn: () => false,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt
  }, {
    fromCell: { x: 0, y: 0 },
    source: 'Drag',
    manualOverride: true
  });
  assert.equal(manualDragAllowed.ok, true);
  assert.equal(manualDragAllowed.manualOverride, true);

  const aiBlockedByEdge = validateTokenMove({
    token: tokens[0],
    toCell: { x: 0, y: 1 },
    tokens,
    isTokenControlledThisTurn: () => true,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt,
    blockingEdges: ['h:0,1']
  }, {
    fromCell: { x: 0, y: 0 },
    source: 'Tactics'
  });
  assert.equal(aiBlockedByEdge.ok, false);
  assert.match(aiBlockedByEdge.reason, /blocking edge blocks the path/);

  const manualMoveAcrossEdge = validateTokenMove({
    token: tokens[0],
    toCell: { x: 0, y: 1 },
    tokens,
    isTokenControlledThisTurn: () => false,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt,
    blockingEdges: ['h:0,1']
  }, {
    fromCell: { x: 0, y: 0 },
    source: 'Drag',
    manualOverride: true
  });
  assert.equal(manualMoveAcrossEdge.ok, true);
  assert.equal(manualMoveAcrossEdge.manualOverride, true);

  const blockedLine = findBlockedLineCrossing({
    fromPoint: { x: 0.5, y: 0.5 },
    toPoint: { x: 0.5, y: 1.5 },
    blockingEdges: ['h:0,1']
  });
  assert.equal(blockedLine.edgeKey, 'h:0,1');

  const openLine = findBlockedLineCrossing({
    fromPoint: { x: 0.5, y: 0.5 },
    toPoint: { x: 1.5, y: 0.5 },
    blockingEdges: ['h:0,1']
  });
  assert.equal(openLine, null);
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

test('shared VTT runtime helpers orchestrate current-turn and AI-controls state changes', () => {
  const tokens = [
    { id: 'm1', type: 'Monster', name: 'Ghoul' },
    { id: 'm2', type: 'Monster', name: 'Ghast' },
    { id: 'p1', type: 'PC', name: 'Lyra' }
  ];

  assert.deepEqual(
    computeCurrentTurnSelectionState(tokens, {
      requestedTokenId: 'm2',
      aiControls: 'Monsters',
      currentTurnTokenId: 'm1',
      selectedTokenIds: ['m1', 'm2'],
      aiGroupTokenIds: ['m1', 'm2'],
      strategyId: 'group_tactical',
      isAiControllableToken,
      resolveAiCurrentTurnTokenId,
      setSingleSelection,
      setSelectedTokenIds
    }),
    {
      currentTurnTokenId: 'm2',
      aiGroupTokenIds: [],
      selectedTokenIds: ['m2'],
      selectedTokenId: 'm2'
    }
  );

  assert.deepEqual(
    computeCurrentTurnSelectionState(tokens, {
      requestedTokenId: 'p1',
      aiControls: 'Monsters',
      currentTurnTokenId: 'm1',
      selectedTokenIds: ['m1'],
      aiGroupTokenIds: [],
      strategyId: 'single_tactical',
      isAiControllableToken,
      resolveAiCurrentTurnTokenId,
      setSingleSelection,
      setSelectedTokenIds
    }),
    {
      currentTurnTokenId: 'p1',
      aiGroupTokenIds: [],
      selectedTokenIds: ['p1'],
      selectedTokenId: 'p1'
    }
  );

  assert.deepEqual(
    computeAiControlsState(tokens, {
      nextAiControls: 'PCs',
      strategyId: 'group_tactical',
      currentTurnTokenId: 'm1',
      selectedTokenIds: ['m1', 'p1'],
      aiGroupTokenIds: ['m1', 'm2'],
      getAiGroupTokenIds,
      getSelectedAiControlledIds,
      resolveAiCurrentTurnTokenId,
      setSelectedTokenIds
    }),
    {
      aiControls: 'PCs',
      aiGroupTokenIds: [],
      selectedTokenIds: ['p1'],
      selectedTokenId: 'p1',
      currentTurnTokenId: 'p1'
    }
  );
});

test('shared VTT runtime helpers orchestrate group assignment and token-list interactions', () => {
  const tokens = [
    { id: 'm1', type: 'Monster', name: 'Ghoul' },
    { id: 'm2', type: 'Monster', name: 'Ghast' },
    { id: 'p1', type: 'PC', name: 'Lyra' }
  ];

  assert.deepEqual(
    computeAiGroupAssignment({
      controlledIds: [],
      currentTurnTokenId: 'm1'
    }),
    {
      ok: false,
      note: 'Select one or more AI-controlled rows to build a tactical group.'
    }
  );

  assert.deepEqual(
    computeAiGroupAssignment({
      controlledIds: ['m1', 'm2'],
      currentTurnTokenId: 'm1'
    }),
    {
      ok: true,
      aiGroupTokenIds: ['m1', 'm2'],
      currentTurnTokenId: 'm1'
    }
  );

  assert.deepEqual(
    computeTokenListInteraction({
      tokenId: 'm2',
      additive: true,
      canPickForGroup: true,
      selectedTokenIds: ['m1'],
      tokens,
      toggleTokenSelection
    }),
    {
      type: 'toggle-selection',
      selectedTokenIds: ['m1', 'm2'],
      selectedTokenId: 'm1'
    }
  );

  assert.deepEqual(
    computeTokenListInteraction({
      tokenId: 'm2',
      additive: false,
      canPickForGroup: true,
      selectedTokenIds: ['m1'],
      tokens,
      toggleTokenSelection
    }),
    {
      type: 'set-current-turn',
      tokenId: 'm2'
    }
  );
});

test('shared VTT runtime helpers orchestrate canvas context menus, mouse down intent, and drag completion', () => {
  assert.deepEqual(
    computeCanvasContextMenuTarget({
      hit: { id: 'm1' },
      clientX: 120,
      clientY: 220
    }),
    {
      openMenu: true,
      tokenId: 'm1',
      clientX: 120,
      clientY: 220
    }
  );

  assert.deepEqual(
    computeCanvasContextMenuTarget({ hit: null, clientX: 10, clientY: 20 }),
    { openMenu: false }
  );

  assert.deepEqual(
    computeCanvasMouseDownIntent({
      button: 0,
      hit: { id: 'm1' },
      metaKey: true,
      ctrlKey: false,
      isAiControllableToken: true,
      spaceDown: false,
      dragMode: 'tokens',
      calibrationActive: false
    }),
    { type: 'toggle-selection', tokenId: 'm1' }
  );

  assert.deepEqual(
    computeCanvasMouseDownIntent({
      button: 0,
      hit: { id: 'm1' },
      metaKey: false,
      ctrlKey: false,
      isAiControllableToken: true,
      spaceDown: false,
      dragMode: 'tokens',
      calibrationActive: false
    }),
    { type: 'drag-token', tokenId: 'm1' }
  );

  assert.deepEqual(
    computeCanvasMouseDownIntent({
      button: 1,
      hit: null,
      metaKey: false,
      ctrlKey: false,
      isAiControllableToken: false,
      spaceDown: false,
      dragMode: 'tokens',
      calibrationActive: false
    }),
    { type: 'pan-stage' }
  );

  assert.deepEqual(
    computeCanvasMouseDownIntent({
      button: 0,
      hit: null,
      metaKey: false,
      ctrlKey: false,
      isAiControllableToken: false,
      spaceDown: false,
      dragMode: 'tokens',
      calibrationActive: false
    }),
    { type: 'pan-stage' }
  );

  assert.deepEqual(
    resolveDragComplete({
      result: { ok: false, reason: 'Blocked path.' },
      token: { id: 'm1', name: 'Ghoul' },
      targetCell: { x: 4, y: 4 },
      fallbackCell: { x: 2, y: 2 }
    }),
    {
      ok: false,
      tokenId: 'm1',
      resetToCell: { x: 2, y: 2 },
      logMessage: 'Move cancelled: Blocked path.'
    }
  );

  assert.deepEqual(
    resolveDragComplete({
      result: { ok: true },
      token: { id: 'm1', name: 'Ghoul' },
      targetCell: { x: 4, y: 4 },
      fallbackCell: { x: 2, y: 2 }
    }),
    {
      ok: true,
      tokenId: 'm1',
      movedToCell: { x: 4, y: 4 },
      logMessage: 'Moved Ghoul -> (4,4)'
    }
  );
});
