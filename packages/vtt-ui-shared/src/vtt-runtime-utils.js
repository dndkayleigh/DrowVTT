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

  const fromCell = gridCoords(token);
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
