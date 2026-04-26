export function buildTokenSelectionNote({
  strategyId,
  strategyLabel = 'Single (Tactical)',
  selectedCount = 0,
  groupCount = 0
} = {}) {
  if (isAiGroupStrategyId(strategyId)) {
    return groupCount
      ? `${strategyLabel} will use ${groupCount} grouped AI-controlled token${groupCount === 1 ? '' : 's'}. Use ctrl/cmd-click on desktop or Group Select on mobile to build the group.`
      : `${strategyLabel} needs an explicit AI-controlled group. Use ctrl/cmd-click on desktop or Group Select on mobile to build the group.`;
  }
  return `${strategyLabel} uses exactly one selected monster. Current selection: ${selectedCount || 0}.`;
}

function isAiGroupStrategyId(strategyId = 'single_tactical') {
  const id = String(strategyId || 'single_tactical');
  return id === 'group_tactical'
    || id.endsWith('_group')
    || id.includes('_group_')
    || id.includes('group');
}

export function shouldFloatAIDrawer(viewportWidth = 0) {
  return Number(viewportWidth) > 900;
}

export function clampFloatingAIDrawerPosition({
  left = 0,
  top = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  drawerWidth = 0,
  drawerHeight = 0,
  padding = 10
} = {}) {
  const maxLeft = Math.max(padding, Number(viewportWidth) - Number(drawerWidth) - padding);
  const maxTop = Math.max(padding, Number(viewportHeight) - Number(drawerHeight) - padding);
  return {
    left: Math.max(padding, Math.min(Number(left), maxLeft)),
    top: Math.max(padding, Math.min(Number(top), maxTop))
  };
}

export function buildTokenRowState(
  token,
  {
    gridCell,
    isSelected = false,
    isGrouped = false,
    isCurrentTurn = false,
    canPickForGroup = true,
    strategyId = 'single_tactical'
  } = {}
) {
  return {
    title: token.type === 'Monster' && token.statblock ? token.statblock : '',
    rowClasses: {
      selected: isSelected,
      grouped: isGrouped
    },
    metaText: `${token.type} • HP ${token.hp} • ${token.sizeCells}×${token.sizeCells} • (${gridCell.x},${gridCell.y})${isGrouped ? ' • Grouped' : ''}${token.art?.src ? ' • Art' : ''}`,
    turnButton: {
      text: isCurrentTurn ? 'Turn' : 'Set',
      primary: isCurrentTurn
    },
    pickButton: {
      text: isSelected ? 'Picked' : 'Pick',
      primary: isSelected,
      disabled: isAiGroupStrategyId(strategyId) && !canPickForGroup
    }
  };
}

export function buildTurnDropdownState({
  tokens,
  controllableIds,
  currentTokenId,
  currentToken,
  resolvedCurrentId
}) {
  const allowedIds = new Set(controllableIds);
  const turnTokens = tokens.filter((token) => allowedIds.has(token.id));
  const currentIsAiControlled = !!currentToken && allowedIds.has(currentToken.id);

  if (!turnTokens.length) {
    return {
      options: [{
        value: '',
        label: currentToken ? `(selected ${currentToken.type}: ${currentToken.name})` : '(no AI-controlled tokens)'
      }],
      value: '',
      currentTurnTokenId: currentTokenId
    };
  }

  const options = turnTokens.map((token) => ({
    value: token.id,
    label: `${token.type}: ${token.name}`
  }));

  if (currentIsAiControlled && resolvedCurrentId && turnTokens.some((token) => token.id === resolvedCurrentId)) {
    return {
      options,
      value: resolvedCurrentId,
      currentTurnTokenId: resolvedCurrentId
    };
  }

  return {
    options: [{
      value: '',
      label: currentToken ? `(selected ${currentToken.type}: ${currentToken.name})` : '(non-AI token selected)'
    }, ...options],
    value: '',
    currentTurnTokenId: currentTokenId
  };
}

export function buildTurnEditorState(token, { normalizeSizeCells } = {}) {
  const normalize = normalizeSizeCells || ((value) => value);
  if (!token) {
    return {
      disabled: true,
      values: {
        ac: 15,
        hp: '',
        size: '1',
        color: '#ff5a7a',
        speed: 30,
        notes: '',
        statblock: ''
      }
    };
  }
  return {
    disabled: false,
    values: {
      ac: Number(token.ac) || 10,
      hp: token.hp ?? '',
      size: String(normalize(token.sizeCells)),
      color: token.color ?? '#ff5a7a',
      speed: Number(token.speed) || 30,
      notes: token.notes ?? '',
      statblock: token.statblock ?? ''
    }
  };
}

function syncTurnEditorStatblock(text, { ac, speed } = {}) {
  let nextText = (text ?? '').trim();
  if (!nextText) return nextText;

  if (Number.isFinite(ac) && ac > 0) {
    nextText = nextText.replace(/(^-\s*AC\s+)([^,\n]+)/m, `$1${ac}`);
  }

  if (Number.isFinite(speed) && speed >= 0) {
    nextText = nextText.replace(/(\bSpeed\s+)(\d+\s*ft\.?)/m, `$1${speed} ft.`);
  }

  return nextText;
}

export function applyTurnEditorToToken(
  token,
  values,
  {
    normalizeSizeCells,
    gridCoords,
    centerFromGridCell
  } = {}
) {
  if (!token) return null;
  const normalize = normalizeSizeCells || ((value) => value);
  const oldCell = gridCoords(token);
  const nextAc = Number(values.ac) || token.ac;
  const nextSpeed = Number(values.speed) || token.speed;
  token.ac = nextAc;
  token.hp = (values.hp ?? '').trim();
  token.sizeCells = normalize(values.size);
  token.color = values.color || token.color;
  token.speed = nextSpeed;
  token.notes = (values.notes ?? '').trim();
  token.statblock = syncTurnEditorStatblock((values.statblock ?? '').trim(), {
    ac: nextAc,
    speed: nextSpeed
  });
  const snapped = centerFromGridCell(oldCell.x, oldCell.y, token.sizeCells);
  token.x = snapped.x;
  token.y = snapped.y;
  return token;
}

export function computeCurrentTurnSelectionState(
  tokens,
  {
    requestedTokenId,
    aiControls,
    currentTurnTokenId,
    selectedTokenIds,
    aiGroupTokenIds,
    strategyId,
    isAiControllableToken,
    resolveAiCurrentTurnTokenId,
    setSingleSelection,
    setSelectedTokenIds
  }
) {
  const requestedId = !requestedTokenId || !tokens.some((token) => token.id === requestedTokenId)
    ? null
    : requestedTokenId;
  const requestedToken = requestedId ? tokens.find((token) => token.id === requestedId) : null;

  if (requestedToken && !isAiControllableToken(requestedToken, aiControls)) {
    return {
      currentTurnTokenId: requestedId,
      aiGroupTokenIds: [],
      ...setSingleSelection(tokens, requestedId)
    };
  }

  const nextCurrentTurnTokenId = resolveAiCurrentTurnTokenId(tokens, {
    aiControls,
    currentTurnTokenId,
    preferredTokenIds: requestedId ? [requestedId] : selectedTokenIds
  });

  if (isAiGroupStrategyId(strategyId) && nextCurrentTurnTokenId) {
    return {
      currentTurnTokenId: nextCurrentTurnTokenId,
      aiGroupTokenIds: [],
      ...setSingleSelection(tokens, nextCurrentTurnTokenId)
    };
  }

  return {
    currentTurnTokenId: nextCurrentTurnTokenId,
    aiGroupTokenIds,
    ...setSingleSelection(tokens, nextCurrentTurnTokenId)
  };
}

export function computeAiControlsState(
  tokens,
  {
    nextAiControls,
    strategyId,
    currentTurnTokenId,
    selectedTokenIds,
    aiGroupTokenIds,
    getAiGroupTokenIds,
    getSelectedAiControlledIds,
    resolveAiCurrentTurnTokenId,
    setSelectedTokenIds
  }
) {
  const nextAiGroupTokenIds = getAiGroupTokenIds(tokens, aiGroupTokenIds, nextAiControls);
  const nextSelected = setSelectedTokenIds(
    tokens,
    isAiGroupStrategyId(strategyId)
      ? getSelectedAiControlledIds(tokens, selectedTokenIds, nextAiControls)
      : selectedTokenIds
  );
  const preferredTokenIds = [
    ...nextAiGroupTokenIds,
    ...getSelectedAiControlledIds(tokens, nextSelected.selectedTokenIds, nextAiControls),
    ...nextSelected.selectedTokenIds
  ];
  return {
    aiControls: nextAiControls,
    aiGroupTokenIds: nextAiGroupTokenIds,
    ...nextSelected,
    currentTurnTokenId: resolveAiCurrentTurnTokenId(tokens, {
      aiControls: nextAiControls,
      currentTurnTokenId,
      preferredTokenIds
    })
  };
}

export function computeAiGroupAssignment({
  controlledIds,
  currentTurnTokenId
}) {
  if (!controlledIds.length) {
    return {
      ok: false,
      note: 'Select one or more AI-controlled rows to build a tactical group.'
    };
  }
  return {
    ok: true,
    aiGroupTokenIds: controlledIds,
    currentTurnTokenId: currentTurnTokenId && controlledIds.includes(currentTurnTokenId)
      ? currentTurnTokenId
      : controlledIds[0]
  };
}

export function computeTokenListInteraction({
  tokenId,
  additive = false,
  canPickForGroup = false,
  selectedTokenIds,
  tokens,
  toggleTokenSelection
}) {
  if (additive && canPickForGroup) {
    const next = toggleTokenSelection(tokens, selectedTokenIds, tokenId);
    return {
      type: 'toggle-selection',
      ...next
    };
  }

  return {
    type: 'set-current-turn',
    tokenId
  };
}

export function computeCanvasContextMenuTarget({
  hit,
  clientX,
  clientY
}) {
  if (!hit) return { openMenu: false };
  return {
    openMenu: true,
    tokenId: hit.id,
    clientX,
    clientY
  };
}

export function computeCanvasMouseDownIntent({
  button = 0,
  hit = null,
  metaKey = false,
  ctrlKey = false,
  isAiControllableToken = false,
  spaceDown = false,
  dragMode = 'tokens',
  calibrationActive = false
}) {
  const wantMultiSelect = (metaKey || ctrlKey) && !!hit && isAiControllableToken;
  const isMiddle = button === 1;
  const wantPan = spaceDown || isMiddle;

  if (calibrationActive && button === 0 && !wantPan) {
    return { type: 'calibration-click' };
  }

  if (wantMultiSelect && !wantPan) {
    return { type: 'toggle-selection', tokenId: hit.id };
  }

  if (hit && !wantPan && dragMode === 'tokens') {
    return { type: 'drag-token', tokenId: hit.id };
  }

  if (!wantPan && dragMode === 'map') {
    return { type: 'drag-map' };
  }

  if (!wantPan && button === 0) {
    return { type: 'pan-stage' };
  }

  return { type: 'pan-stage' };
}

export function resolveDragComplete({
  result,
  token,
  targetCell,
  fallbackCell
}) {
  if (!result?.ok) {
    return {
      ok: false,
      tokenId: token.id,
      resetToCell: fallbackCell,
      logMessage: `Move cancelled: ${result?.reason || 'Unknown move failure.'}`
    };
  }

  return {
    ok: true,
    tokenId: token.id,
    movedToCell: targetCell,
    logMessage: `Moved ${token.name} -> (${targetCell.x},${targetCell.y})`
  };
}

export function buildTokenContextMenuState(
  token,
  {
    clientX,
    clientY,
    viewportWidth,
    viewportHeight,
    menuWidth = 190,
    menuHeight = 92,
    padding = 10
  } = {}
) {
  if (!token) return null;
  return {
    tokenId: token.id,
    addArtLabel: token.art?.src ? 'Edit art' : 'Add art',
    clearArtDisabled: !token.art?.src,
    left: Math.max(padding, Math.min(clientX, viewportWidth - menuWidth - padding)),
    top: Math.max(padding, Math.min(clientY, viewportHeight - menuHeight - padding))
  };
}

export function tokenSide(token) {
  return token?.type === 'Monster' ? 'monsters' : 'friendlies';
}

export function areFriendlyTokens(a, b) {
  return tokenSide(a) === tokenSide(b);
}

export function pathCellsBetween(fromCell, toCell) {
  const steps = [];
  let x = fromCell.x;
  let y = fromCell.y;
  while (x !== toCell.x || y !== toCell.y) {
    if (x < toCell.x) x += 1;
    else if (x > toCell.x) x -= 1;

    if (y < toCell.y) y += 1;
    else if (y > toCell.y) y -= 1;

    steps.push({ x, y });
  }
  return steps;
}

export function normalizeBlockingEdgeKey(edge) {
  if (typeof edge === 'string') {
    const match = edge.trim().match(/^([vh]):(-?\d+),(-?\d+)$/i);
    if (!match) return '';
    return `${match[1].toLowerCase()}:${Number(match[2])},${Number(match[3])}`;
  }

  if (!edge || typeof edge !== 'object') return '';
  const rawOrientation = String(edge.orientation || edge.axis || edge.type || '').trim().toLowerCase();
  const orientation = rawOrientation === 'v' || rawOrientation === 'vertical'
    ? 'v'
    : (rawOrientation === 'h' || rawOrientation === 'horizontal' ? 'h' : '');
  const x = Number(edge.x);
  const y = Number(edge.y);
  if (!orientation || !Number.isInteger(x) || !Number.isInteger(y)) return '';
  return `${orientation}:${x},${y}`;
}

export function normalizeBlockingEdgeKeys(edges = []) {
  const values = Array.isArray(edges) ? edges : [...(edges instanceof Set ? edges : [])];
  return [...new Set(values.map(normalizeBlockingEdgeKey).filter(Boolean))].sort((left, right) => {
    const [leftOrientation, leftCoords] = left.split(':');
    const [rightOrientation, rightCoords] = right.split(':');
    if (leftOrientation !== rightOrientation) return leftOrientation.localeCompare(rightOrientation);
    const [leftX, leftY] = leftCoords.split(',').map(Number);
    const [rightX, rightY] = rightCoords.split(',').map(Number);
    return leftX - rightX || leftY - rightY;
  });
}

export function parseBlockingEdgeKey(edgeKey) {
  const normalized = normalizeBlockingEdgeKey(edgeKey);
  if (!normalized) return null;
  const [orientation, coords] = normalized.split(':');
  const [x, y] = coords.split(',').map(Number);
  return { orientation, x, y, key: normalized };
}

export function blockingEdgesBetweenCells(fromCell, toCell) {
  if (!fromCell || !toCell) return [];
  const fromX = Number(fromCell.x);
  const fromY = Number(fromCell.y);
  const toX = Number(toCell.x);
  const toY = Number(toCell.y);
  if (![fromX, fromY, toX, toY].every(Number.isInteger)) return [];

  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  const edges = [];
  if (dx !== 0) {
    edges.push(`v:${Math.max(fromX, toX)},${fromY}`);
    if (dy !== 0) edges.push(`v:${Math.max(fromX, toX)},${toY}`);
  }
  if (dy !== 0) {
    edges.push(`h:${fromX},${Math.max(fromY, toY)}`);
    if (dx !== 0) edges.push(`h:${toX},${Math.max(fromY, toY)}`);
  }
  return normalizeBlockingEdgeKeys(edges);
}

export function findBlockedEdgeCrossing({ fromCell, toCell, blockingEdges = [] } = {}) {
  const blocked = new Set(normalizeBlockingEdgeKeys(blockingEdges));
  if (!blocked.size) return null;

  let previous = fromCell;
  for (const step of pathCellsBetween(fromCell, toCell)) {
    const crossed = blockingEdgesBetweenCells(previous, step);
    const blockedKey = crossed.find((edgeKey) => blocked.has(edgeKey));
    if (blockedKey) return { edgeKey: blockedKey, fromCell: previous, toCell: step };
    previous = step;
  }
  return null;
}

function lineOrientation(a, b, c) {
  const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnLineSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) + 1e-9
    && b.x + 1e-9 >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) + 1e-9
    && b.y + 1e-9 >= Math.min(a.y, c.y);
}

function lineSegmentsIntersect(a, b, c, d) {
  const o1 = lineOrientation(a, b, c);
  const o2 = lineOrientation(a, b, d);
  const o3 = lineOrientation(c, d, a);
  const o4 = lineOrientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnLineSegment(a, c, b)) return true;
  if (o2 === 0 && pointOnLineSegment(a, d, b)) return true;
  if (o3 === 0 && pointOnLineSegment(c, a, d)) return true;
  if (o4 === 0 && pointOnLineSegment(c, b, d)) return true;
  return false;
}

export function findBlockedLineCrossing({ fromPoint, toPoint, blockingEdges = [] } = {}) {
  const start = {
    x: Number(fromPoint?.x),
    y: Number(fromPoint?.y)
  };
  const end = {
    x: Number(toPoint?.x),
    y: Number(toPoint?.y)
  };
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;

  for (const edgeKey of normalizeBlockingEdgeKeys(blockingEdges)) {
    const edge = parseBlockingEdgeKey(edgeKey);
    if (!edge) continue;
    const edgeStart = { x: edge.x, y: edge.y };
    const edgeEnd = edge.orientation === 'v'
      ? { x: edge.x, y: edge.y + 1 }
      : { x: edge.x + 1, y: edge.y };
    if (lineSegmentsIntersect(start, end, edgeStart, edgeEnd)) {
      return { edgeKey, fromPoint: start, toPoint: end };
    }
  }
  return null;
}

export function validateTokenMove(
  {
    token,
    toCell,
    tokens,
    isTokenControlledThisTurn,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt,
    blockingEdges = []
  },
  options = {}
) {
  const { ignoreSpeed = false, source = 'move', manualOverride = false } = options;
  if (!token) return { ok: false, reason: 'Unknown token.' };
  const fromCell = options.fromCell || gridCoords(token);
  if (manualOverride) {
    return { ok: true, fromCell, toCell, distanceCells: chebyshevDistanceCells(fromCell, toCell), source, manualOverride: true };
  }
  const blockedCrossing = findBlockedEdgeCrossing({
    fromCell,
    toCell,
    blockingEdges: options.blockingEdges || blockingEdges
  });
  if (blockedCrossing) {
    return {
      ok: false,
      reason: `${token.name} cannot move to (${toCell.x},${toCell.y}); a blocking edge blocks the path.`,
      fromCell,
      toCell,
      blockedEdgeKey: blockedCrossing.edgeKey,
      source,
      manualOverride
    };
  }
  if (!isTokenControlledThisTurn(token)) {
    return { ok: false, reason: `${token.name} cannot move because it is not the current turn token.` };
  }

  const maxCells = Math.floor((Number(token.speed) || 0) / 5);
  const distanceCells = chebyshevDistanceCells(fromCell, toCell);
  if (!ignoreSpeed && distanceCells > maxCells) {
    return {
      ok: false,
      reason: `${token.name} cannot move to (${toCell.x},${toCell.y}); speed ${token.speed} ft allows ${maxCells} cells, not ${distanceCells}.`
    };
  }

  for (const other of tokens) {
    if (other.id === token.id) continue;
    const otherCell = gridCoords(other);
    const occupied = new Set(
      cellsOccupiedAt(otherCell.x, otherCell.y, other.sizeCells).map((cell) => `${cell.x},${cell.y}`)
    );
    const path = pathCellsBetween(fromCell, toCell);
    for (let i = 0; i < path.length; i += 1) {
      const step = path[i];
      const destinationCell = options.pathDestination || toCell;
      const isFinalStep = i === path.length - 1
        && step.x === destinationCell.x
        && step.y === destinationCell.y;
      const stepCells = cellsOccupiedAt(step.x, step.y, token.sizeCells);
      const blockedCell = stepCells.find((cell) => occupied.has(`${cell.x},${cell.y}`));
      if (!blockedCell) continue;

      if (isFinalStep || !areFriendlyTokens(token, other)) {
        return {
          ok: false,
          reason: isFinalStep
            ? `${token.name} cannot move to (${toCell.x},${toCell.y}); space is occupied by ${other.name}.`
            : `${token.name} cannot pass through ${other.name}.`
        };
      }
    }
  }

  return { ok: true, fromCell, toCell, distanceCells, source };
}

export function moveTokenToCell(
  {
    token,
    cell,
    validateMove,
    centerFromGridCell,
    onMoved
  },
  options = {}
) {
  const result = validateMove(token, cell, options);
  if (!result.ok) return result;
  const snapped = centerFromGridCell(cell.x, cell.y, token.sizeCells);
  token.x = snapped.x;
  token.y = snapped.y;
  onMoved?.({
    tokenId: token.id,
    name: token.name,
    toCell: { x: cell.x, y: cell.y },
    source: options.source || 'move'
  });
  return result;
}
