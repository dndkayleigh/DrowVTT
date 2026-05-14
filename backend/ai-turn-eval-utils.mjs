import {
  areFriendlyTokens,
  attackRangeCells,
  cellsOccupiedAt,
  chebyshevDistanceCells,
  chooseMoveCandidates,
  computeAttackOpportunities,
  getCurrentTurnToken,
  gridCoordsFromToken,
  maxMoveCellsForToken,
  minTokenDistanceCells,
  parseAttackProfiles
} from '../data/ai-turn-packet-utils.mjs';
import {
  findBlockedLineCrossing,
  normalizeBlockingEdgeKeys
} from '../packages/vtt-ui-shared/src/vtt-runtime-utils.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathCellsBetween(fromCell, toCell) {
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

function parseGridCellTuple(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

function normalizeMovePath(path, fromCell, toCell) {
  const provided = Array.isArray(path)
    ? path.map(parseGridCellTuple).filter(Boolean)
    : [];
  const cells = provided.length ? provided.slice() : pathCellsBetween(fromCell, toCell);
  if (!cells.length || cells[0].x !== fromCell.x || cells[0].y !== fromCell.y) {
    cells.unshift({ x: fromCell.x, y: fromCell.y });
  }
  const last = cells[cells.length - 1];
  if (last.x !== toCell.x || last.y !== toCell.y) {
    cells.push({ x: toCell.x, y: toCell.y });
  }
  return cells.filter((cell, index) =>
    index === 0 || cell.x !== cells[index - 1].x || cell.y !== cells[index - 1].y
  );
}

function findTokenByName(state, name) {
  return (state.tokens || []).find((token) => token.name === name) || null;
}

function isTokenControlledThisTurn(state, token) {
  return !!token && token.id === state.currentTurnTokenId;
}

function getBlockingEdgeKeys(state) {
  return normalizeBlockingEdgeKeys(state?.blockingEdges?.edgeKeys || state?.blockingEdges || []);
}

function tokenAimPoint(state, token, fromCell = null) {
  const cell = fromCell || gridCoordsFromToken(state, token);
  const size = Math.max(1, Math.round(Number(token?.sizeCells) || 1));
  return {
    x: cell.x + (size / 2),
    y: cell.y + (size / 2)
  };
}

function resolveAttackProfileForAction(actor, action = {}) {
  const explicitKind = action?.attack_kind == null ? '' : String(action.attack_kind).toLowerCase();
  const explicitRange = Number(action?.range_ft);
  const details = String(action?.details ?? '').toLowerCase();
  const profiles = parseAttackProfiles(actor?.statblock || '');
  const namedProfile = profiles.find((profile) => {
    const name = String(profile.name || '').toLowerCase();
    return name && details.includes(name);
  });
  const inferredProfile = namedProfile || profiles.find((profile) =>
    Number.isFinite(explicitRange)
      && Number(profile.rangeFt) === explicitRange
      && (!explicitKind || String(profile.attackKind).toLowerCase() === explicitKind)
  );
  const kind = explicitKind === 'melee' || explicitKind === 'ranged'
    ? explicitKind
    : inferredProfile?.attackKind || '';
  const rangeFt = Number.isFinite(explicitRange) && explicitRange > 0
    ? explicitRange
    : Number(inferredProfile?.rangeFt);
  return {
    attackKind: kind,
    rangeFt,
    profile: inferredProfile || null
  };
}

function validateMoveShape(move, index) {
  const issues = [];
  if (!move || typeof move !== 'object' || Array.isArray(move)) {
    return [`moves[${index}] must be an object`];
  }
  if (typeof move.token !== 'string' || !move.token.trim()) issues.push(`moves[${index}].token must be a non-empty string`);
  if (move.rationale !== null && typeof move.rationale !== 'string') issues.push(`moves[${index}].rationale must be string|null`);
  if (!Array.isArray(move.to) || move.to.length !== 2 || !move.to.every(Number.isInteger)) {
    issues.push(`moves[${index}].to must be [int,int]`);
  }
  if (move.path !== null) {
    if (!Array.isArray(move.path)) {
      issues.push(`moves[${index}].path must be array|null`);
    } else {
      for (const [pathIndex, tuple] of move.path.entries()) {
        if (!Array.isArray(tuple) || tuple.length !== 2 || !tuple.every(Number.isInteger)) {
          issues.push(`moves[${index}].path[${pathIndex}] must be [int,int]`);
        }
      }
    }
  }
  return issues;
}

function validateActionShape(action, index) {
  const issues = [];
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return [`actions[${index}] must be an object`];
  }
  if (typeof action.token !== 'string' || !action.token.trim()) issues.push(`actions[${index}].token must be a non-empty string`);
  if (typeof action.type !== 'string' || !action.type.trim()) issues.push(`actions[${index}].type must be a non-empty string`);
  if (action.target !== null && typeof action.target !== 'string') issues.push(`actions[${index}].target must be string|null`);
  if (typeof action.details !== 'string') issues.push(`actions[${index}].details must be a string`);
  if (action.rationale !== null && typeof action.rationale !== 'string') issues.push(`actions[${index}].rationale must be string|null`);
  if (action.attack_kind !== null && typeof action.attack_kind !== 'string') issues.push(`actions[${index}].attack_kind must be string|null`);
  if (action.range_ft !== null && !Number.isInteger(action.range_ft)) issues.push(`actions[${index}].range_ft must be int|null`);
  return issues;
}

export function validateAiTurnSchemaShape(obj) {
  const issues = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, issues: ['root must be an object'] };
  }
  if (obj.summary !== null && typeof obj.summary !== 'string') issues.push('summary must be string|null');
  if (!Array.isArray(obj.moves)) issues.push('moves must be an array');
  if (!Array.isArray(obj.actions)) issues.push('actions must be an array');
  if (typeof obj.end_turn !== 'boolean') issues.push('end_turn must be boolean');

  if (Array.isArray(obj.moves)) {
    for (const [index, move] of obj.moves.entries()) issues.push(...validateMoveShape(move, index));
  }
  if (Array.isArray(obj.actions)) {
    for (const [index, action] of obj.actions.entries()) issues.push(...validateActionShape(action, index));
  }

  return { ok: issues.length === 0, issues };
}

function validateProvidedPath(movePath, fromCell, toCell) {
  const path = normalizeMovePath(movePath, fromCell, toCell);
  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1];
    const next = path[index];
    const dx = Math.abs(next.x - prev.x);
    const dy = Math.abs(next.y - prev.y);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      return {
        ok: false,
        reason: `Path contains a non-adjacent step from (${prev.x},${prev.y}) to (${next.x},${next.y}).`,
        path
      };
    }
  }
  return { ok: true, path };
}

export function validateTokenMove(state, token, toCell) {
  if (!token) return { ok: false, reason: 'Unknown token.' };
  if (!isTokenControlledThisTurn(state, token)) {
    return { ok: false, reason: `${token.name} cannot move because it is not the current turn token.` };
  }

  const fromCell = gridCoordsFromToken(state, token);
  const maxCells = maxMoveCellsForToken(token);
  const distanceCells = chebyshevDistanceCells(fromCell, toCell);
  if (distanceCells > maxCells) {
    return {
      ok: false,
      reason: `${token.name} cannot move to (${toCell.x},${toCell.y}); speed ${token.speed} ft allows ${maxCells} cells, not ${distanceCells}.`
    };
  }

  for (const other of state.tokens || []) {
    if (other.id === token.id) continue;
    const otherCell = gridCoordsFromToken(state, other);
    const occupied = new Set(
      cellsOccupiedAt(otherCell.x, otherCell.y, other.sizeCells).map((cell) => `${cell.x},${cell.y}`)
    );
    const path = pathCellsBetween(fromCell, toCell);
    for (let index = 0; index < path.length; index += 1) {
      const step = path[index];
      const isFinalStep = index === path.length - 1;
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

  return { ok: true, fromCell, toCell, distanceCells };
}

function centerFromGridCell(state, cellX, cellY, sizeCells) {
  const gridSize = Number(state?.gridSize) || 64;
  if (state?.snapMode === 'topleft') {
    return { x: cellX * gridSize, y: cellY * gridSize };
  }
  return {
    x: gridSize * (cellX + (sizeCells / 2)),
    y: gridSize * (cellY + (sizeCells / 2))
  };
}

function applyMoveToState(state, token, toCell) {
  const snapped = centerFromGridCell(state, toCell.x, toCell.y, token.sizeCells);
  token.x = snapped.x;
  token.y = snapped.y;
}

export function validateAction(state, action) {
  const tokenName = (action?.token ?? '').toString();
  const type = (action?.type ?? 'other').toString().toLowerCase();
  const targetName = action?.target == null ? null : String(action.target);
  if (!tokenName) return { ok: false, reason: 'Action ignored: missing token name.' };

  const actor = findTokenByName(state, tokenName);
  if (!actor) return { ok: false, reason: `Action ignored (token not found): ${tokenName}` };
  if (!isTokenControlledThisTurn(state, actor)) {
    return { ok: false, reason: `${tokenName} cannot act because it is not the current turn token.` };
  }

  if (type !== 'attack') return { ok: true, actor, target: null, type };
  if (!targetName) return { ok: false, reason: `${tokenName} attack ignored: missing target.` };
  const target = findTokenByName(state, targetName);
  if (!target) return { ok: false, reason: `${tokenName} attack ignored: target not found (${targetName}).` };
  const { attackKind, rangeFt } = resolveAttackProfileForAction(actor, action);
  if (!attackKind || !['melee', 'ranged'].includes(attackKind)) {
    return { ok: false, reason: `${tokenName} attack ignored: invalid attack_kind (${action?.attack_kind ?? 'null'}).` };
  }
  if (!Number.isFinite(rangeFt) || rangeFt <= 0) {
    return { ok: false, reason: `${tokenName} attack ignored: invalid range_ft (${action?.range_ft ?? 'null'}).` };
  }

  const maxCells = attackRangeCells(rangeFt);
  const originCell = parseGridCellTuple(action?.from) || null;
  const actualCells = (() => {
    const actorCell = originCell || gridCoordsFromToken(state, actor);
    const targetCell = gridCoordsFromToken(state, target);
    let minDistance = Infinity;
    for (const left of cellsOccupiedAt(actorCell.x, actorCell.y, actor.sizeCells)) {
      for (const right of cellsOccupiedAt(targetCell.x, targetCell.y, target.sizeCells)) {
        minDistance = Math.min(minDistance, chebyshevDistanceCells(left, right));
      }
    }
    return Number.isFinite(minDistance) ? minDistance : 0;
  })();
  if (actualCells > maxCells) {
    return {
      ok: false,
      reason: `${tokenName} cannot make a ${attackKind} attack on ${targetName} from ${actualCells * 5} ft away; range ${rangeFt} ft requires within ${maxCells} cells.`
    };
  }

  if (attackKind === 'ranged') {
    const blockedLine = findBlockedLineCrossing({
      fromPoint: tokenAimPoint(state, actor, originCell),
      toPoint: tokenAimPoint(state, target),
      blockingEdges: getBlockingEdgeKeys(state)
    });
    if (blockedLine) {
      return {
        ok: false,
        reason: `${tokenName} cannot make a ranged attack on ${targetName}; a blocking edge blocks line of fire.`
      };
    }
  }

  return { ok: true, actor, target, type, attackKind, rangeFt, actualCells };
}

function evaluateCandidateConsistency(baseState, compactOptions, parsed, appliedState) {
  if (!compactOptions) {
    return {
      moveCandidateMatch: null,
      attackCandidateMatch: null,
      issues: []
    };
  }

  const turnTok = getCurrentTurnToken(baseState);
  const enemies = turnTok
    ? (baseState.tokens || []).filter((token) => token.id !== turnTok.id && !areFriendlyTokens(token, turnTok))
    : [];
  const moveCandidates = turnTok
    ? chooseMoveCandidates(baseState, turnTok, enemies, compactOptions.moveCandidateLimit ?? 10)
    : [];
  const attackOpportunities = turnTok
    ? computeAttackOpportunities(
      baseState,
      turnTok,
      moveCandidates,
      enemies,
      compactOptions.attackOpportunityLimit ?? 12
    )
    : [];

  const issues = [];
  let moveCandidateMatch = true;
  for (const move of parsed.moves) {
    const match = moveCandidates.some((candidate) => candidate.x === move.to[0] && candidate.y === move.to[1]);
    if (!match) {
      moveCandidateMatch = false;
      issues.push(`Move destination (${move.to[0]},${move.to[1]}) was not listed in compact legal move candidates.`);
    }
  }

  let attackCandidateMatch = true;
  const currentToken = getCurrentTurnToken(appliedState);
  const currentCell = currentToken ? gridCoordsFromToken(appliedState, currentToken) : null;
  for (const action of parsed.actions) {
    if ((action?.type ?? '').toString().toLowerCase() !== 'attack') continue;
    const target = action?.target == null ? null : String(action.target);
    const attackKind = action?.attack_kind == null ? null : String(action.attack_kind).toLowerCase();
    const rangeFt = action?.range_ft == null ? null : Number(action.range_ft);
    const match = attackOpportunities.some((option) =>
      option.target === target &&
      option.attackKind === attackKind &&
      option.rangeFt === rangeFt &&
      currentCell &&
      option.from.x === currentCell.x &&
      option.from.y === currentCell.y
    );
    if (!match) {
      attackCandidateMatch = false;
      issues.push(`Attack on ${target ?? 'unknown target'} was not listed in compact legal attack windows.`);
    }
  }

  return { moveCandidateMatch, attackCandidateMatch, issues };
}

function evaluateTacticalSignals(state, parsed) {
  const actor = getCurrentTurnToken(state);
  const tacticalIssues = [];
  if (!actor) {
    return {
      tacticalSound: true,
      dodgeInMeleeWithoutAttack: false,
      meleeAttackOptionsAtEnd: 0,
      tacticalIssues
    };
  }

  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const actorActions = actions.filter((action) => String(action?.token ?? '') === actor.name);
  const hasAttack = actorActions.some((action) => String(action?.type ?? '').toLowerCase() === 'attack');
  const hasDodge = actorActions.some((action) => String(action?.type ?? '').toLowerCase() === 'dodge');

  const meleeProfiles = parseAttackProfiles(actor?.statblock).filter((profile) => profile.attackKind === 'melee');
  const enemies = (state.tokens || []).filter((token) => token.id !== actor.id && !areFriendlyTokens(token, actor));

  let meleeAttackOptionsAtEnd = 0;
  if (meleeProfiles.length && enemies.length) {
    for (const enemy of enemies) {
      for (const profile of meleeProfiles) {
        const maxCells = attackRangeCells(profile.rangeFt);
        const actualCells = minTokenDistanceCells(state, actor, enemy);
        if (actualCells <= maxCells) meleeAttackOptionsAtEnd += 1;
      }
    }
  }

  const dodgeInMeleeWithoutAttack = hasDodge && !hasAttack && meleeAttackOptionsAtEnd > 0;
  if (dodgeInMeleeWithoutAttack) {
    tacticalIssues.push(
      `${actor.name} took Dodge even though ${meleeAttackOptionsAtEnd} legal melee attack option${meleeAttackOptionsAtEnd === 1 ? '' : 's'} remained available at the final position.`
    );
  }

  return {
    tacticalSound: tacticalIssues.length === 0,
    dodgeInMeleeWithoutAttack,
    meleeAttackOptionsAtEnd,
    tacticalIssues
  };
}

export function evaluateAiTurnResponse(state, parsed, options = {}) {
  const schema = validateAiTurnSchemaShape(parsed);
  const workingState = deepClone(state);
  const moveEvaluations = [];
  const actionEvaluations = [];
  const issues = [];

  if (!schema.ok) {
    issues.push(...schema.issues);
  }

  const moves = Array.isArray(parsed?.moves) ? parsed.moves : [];
  for (const move of moves) {
    const token = findTokenByName(workingState, (move?.token ?? '').toString());
    const toCell = parseGridCellTuple(move?.to);
    if (!toCell) {
      moveEvaluations.push({ ok: false, reason: `Invalid move destination for ${move?.token ?? 'unknown token'}.` });
      issues.push(`Invalid move destination for ${move?.token ?? 'unknown token'}.`);
      continue;
    }

    const moveValidation = validateTokenMove(workingState, token, toCell);
    const pathValidation = moveValidation.ok
      ? validateProvidedPath(move?.path ?? null, moveValidation.fromCell, moveValidation.toCell)
      : { ok: false, reason: moveValidation.reason, path: null };

    const evaluation = {
      token: move?.token ?? null,
      to: move?.to ?? null,
      ok: moveValidation.ok && pathValidation.ok,
      moveLegal: moveValidation.ok,
      pathLegal: pathValidation.ok,
      reason: moveValidation.ok ? (pathValidation.ok ? null : pathValidation.reason) : moveValidation.reason
    };
    moveEvaluations.push(evaluation);
    if (!evaluation.ok) {
      issues.push(evaluation.reason);
      continue;
    }
    applyMoveToState(workingState, token, toCell);
  }

  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  for (const action of actions) {
    const evaluation = validateAction(workingState, action);
    actionEvaluations.push({
      token: action?.token ?? null,
      type: action?.type ?? null,
      target: action?.target ?? null,
      ok: evaluation.ok,
      reason: evaluation.ok ? null : evaluation.reason
    });
    if (!evaluation.ok) issues.push(evaluation.reason);
  }

  const candidateConsistency = evaluateCandidateConsistency(
    state,
    options.compactOptions ?? null,
    parsed || { moves: [], actions: [] },
    workingState
  );
  issues.push(...candidateConsistency.issues);
  const tacticalSignals = evaluateTacticalSignals(workingState, parsed);
  issues.push(...tacticalSignals.tacticalIssues);

  return {
    schemaValid: schema.ok,
    moveCount: moves.length,
    actionCount: actions.length,
    moveEvaluations,
    actionEvaluations,
    movesLegal: moveEvaluations.every((entry) => entry.ok),
    actionsLegal: actionEvaluations.every((entry) => entry.ok),
    legalTurn: schema.ok && moveEvaluations.every((entry) => entry.ok) && actionEvaluations.every((entry) => entry.ok),
    moveCandidateMatch: candidateConsistency.moveCandidateMatch,
    attackCandidateMatch: candidateConsistency.attackCandidateMatch,
    tacticalSound: tacticalSignals.tacticalSound,
    dodgeInMeleeWithoutAttack: tacticalSignals.dodgeInMeleeWithoutAttack,
    meleeAttackOptionsAtEnd: tacticalSignals.meleeAttackOptionsAtEnd,
    tacticalIssues: tacticalSignals.tacticalIssues,
    issues
  };
}
