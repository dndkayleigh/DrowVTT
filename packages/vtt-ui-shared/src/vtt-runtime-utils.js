export function buildTokenSelectionNote({
  strategyId,
  strategyLabel = 'Single (Tactical)',
  selectedCount = 0,
  groupCount = 0
} = {}) {
  if (strategyId === 'group_tactical') {
    return groupCount
      ? `${strategyLabel} will use ${groupCount} grouped AI-controlled token${groupCount === 1 ? '' : 's'}. Use Pick or ctrl/cmd-click eligible tokens, then click Set Group From Selection.`
      : `${strategyLabel} needs an explicit AI-controlled group. Use Pick or ctrl/cmd-click eligible rows, then click Set Group From Selection.`;
  }
  return `${strategyLabel} uses exactly one selected monster. Current selection: ${selectedCount || 0}.`;
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
      disabled: strategyId === 'group_tactical' && !canPickForGroup
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
  token.ac = Number(values.ac) || token.ac;
  token.hp = (values.hp ?? '').trim();
  token.sizeCells = normalize(values.size);
  token.color = values.color || token.color;
  token.speed = Number(values.speed) || token.speed;
  token.notes = (values.notes ?? '').trim();
  token.statblock = (values.statblock ?? '').trim();
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

  if (strategyId === 'group_tactical' && nextCurrentTurnTokenId) {
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
    strategyId === 'group_tactical'
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
      note: 'Select one or more AI-controlled rows with Pick before creating a tactical group.'
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

export function validateTokenMove(
  {
    token,
    toCell,
    tokens,
    isTokenControlledThisTurn,
    gridCoords,
    chebyshevDistanceCells,
    cellsOccupiedAt
  },
  options = {}
) {
  const { ignoreSpeed = false, source = 'move' } = options;
  if (!token) return { ok: false, reason: 'Unknown token.' };
  if (!isTokenControlledThisTurn(token)) {
    return { ok: false, reason: `${token.name} cannot move because it is not the current turn token.` };
  }

  const fromCell = options.fromCell || gridCoords(token);
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
      const isFinalStep = i === path.length - 1;
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
