function normalizeSizeCells(sizeCells) {
  return Math.max(1, Math.round(Number(sizeCells) || 1));
}

export function gridCoordsFromToken(state, token) {
  const g = Number(state?.gridSize) || 64;
  const footprint = normalizeSizeCells(token?.sizeCells);
  if (state?.snapMode === 'topleft') {
    return {
      x: Math.floor((Number(token?.x) || 0) / g),
      y: Math.floor((Number(token?.y) || 0) / g)
    };
  }
  return {
    x: Math.round(((Number(token?.x) || 0) / g) - (footprint / 2)),
    y: Math.round(((Number(token?.y) || 0) / g) - (footprint / 2))
  };
}

export function cellsOccupiedAt(cellX, cellY, sizeCells) {
  const footprint = normalizeSizeCells(sizeCells);
  const cells = [];
  for (let dx = 0; dx < footprint; dx += 1) {
    for (let dy = 0; dy < footprint; dy += 1) {
      cells.push({ x: cellX + dx, y: cellY + dy });
    }
  }
  return cells;
}

export function chebyshevDistanceCells(fromCell, toCell) {
  return Math.max(Math.abs(toCell.x - fromCell.x), Math.abs(toCell.y - fromCell.y));
}

export function minTokenDistanceCells(state, attacker, target, fromCellOverride = null) {
  const attackerCell = fromCellOverride || gridCoordsFromToken(state, attacker);
  const targetCell = gridCoordsFromToken(state, target);
  const attackerCells = cellsOccupiedAt(attackerCell.x, attackerCell.y, attacker.sizeCells);
  const targetCells = cellsOccupiedAt(targetCell.x, targetCell.y, target.sizeCells);
  let minDistance = Infinity;
  for (const left of attackerCells) {
    for (const right of targetCells) {
      minDistance = Math.min(minDistance, chebyshevDistanceCells(left, right));
    }
  }
  return Number.isFinite(minDistance) ? minDistance : 0;
}

export function attackRangeCells(rangeFt) {
  const feet = Number(rangeFt);
  if (!Number.isFinite(feet) || feet <= 0) return 1;
  return Math.max(1, Math.ceil(feet / 5));
}

function tokenSide(token) {
  return token?.type === 'Monster' ? 'monsters' : 'friendlies';
}

export function areFriendlyTokens(tokenA, tokenB) {
  return tokenSide(tokenA) === tokenSide(tokenB);
}

export function getCurrentTurnToken(state) {
  return state?.tokens?.find((token) => token.id === state.currentTurnTokenId) || null;
}

export function getActiveAiGroupTokens(state) {
  const ids = new Set(Array.isArray(state?.aiGroupTokenIds) ? state.aiGroupTokenIds.map((id) => String(id)) : []);
  return (state?.tokens || []).filter((token) => ids.has(token.id));
}

function relationToTurnToken(turnTok, token) {
  if (!turnTok) return 'unknown';
  if (token.id === turnTok.id) return 'self';
  return areFriendlyTokens(token, turnTok) ? 'ally' : 'enemy';
}

export function maxMoveCellsForToken(token) {
  return Math.floor((Number(token?.speed) || 0) / 5);
}

function serializeCell(cell) {
  return `${cell.x},${cell.y}`;
}

function getOccupiedCellMap(state, movingToken) {
  const occupied = new Map();
  for (const token of state.tokens || []) {
    if (movingToken && token.id === movingToken.id) continue;
    const tokenCell = gridCoordsFromToken(state, token);
    for (const cell of cellsOccupiedAt(tokenCell.x, tokenCell.y, token.sizeCells)) {
      occupied.set(serializeCell(cell), token);
    }
  }
  return occupied;
}

function canOccupyCell(state, token, cell, occupiedMap) {
  for (const candidate of cellsOccupiedAt(cell.x, cell.y, token.sizeCells)) {
    if (occupiedMap.has(serializeCell(candidate))) return false;
  }
  return true;
}

function canTraverseCell(state, token, cell, occupiedMap) {
  for (const candidate of cellsOccupiedAt(cell.x, cell.y, token.sizeCells)) {
    const blocker = occupiedMap.get(serializeCell(candidate));
    if (!blocker) continue;
    if (!areFriendlyTokens(token, blocker)) return false;
  }
  return true;
}

function legalMoveDestinations(state, token, limit = 24) {
  if (!token) return [];
  const start = gridCoordsFromToken(state, token);
  const maxCells = maxMoveCellsForToken(token);
  const occupiedMap = getOccupiedCellMap(state, token);
  const queue = [{ cell: start, steps: 0 }];
  const visited = new Set([serializeCell(start)]);
  const destinations = [{ ...start, steps: 0 }];
  const directions = [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 },                    { x: 1, y: 0 },
    { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 }
  ];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.steps >= maxCells) continue;
    for (const direction of directions) {
      const next = {
        x: current.cell.x + direction.x,
        y: current.cell.y + direction.y
      };
      const key = serializeCell(next);
      if (visited.has(key)) continue;
      visited.add(key);

      const stepCount = current.steps + 1;
      if (!canTraverseCell(state, token, next, occupiedMap)) continue;
      if (!canOccupyCell(state, token, next, occupiedMap)) continue;

      const destination = { ...next, steps: stepCount };
      destinations.push(destination);
      queue.push({ cell: next, steps: stepCount });
      if (destinations.length >= limit * 4) break;
    }
    if (destinations.length >= limit * 4) break;
  }

  return destinations;
}

export function parseAttackProfiles(statblockText) {
  const text = (statblockText || '').toString();
  if (!text) return [];
  const profiles = [];
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    const meleeMatch = line.match(/^- ([^:]+): Melee .*?\+(\d+) to hit, reach (\d+) ft\./i);
    if (meleeMatch) {
      profiles.push({
        name: meleeMatch[1],
        attackKind: 'melee',
        rangeFt: Number(meleeMatch[3]),
        raw: line
      });
      continue;
    }
    const rangedMatch = line.match(/^- ([^:]+): Ranged .*?\+(\d+) to hit, range (\d+)(?:\/\d+)?/i);
    if (rangedMatch) {
      profiles.push({
        name: rangedMatch[1],
        attackKind: 'ranged',
        rangeFt: Number(rangedMatch[3]),
        raw: line
      });
      continue;
    }

    const shorthandRangedMatch = line.match(/^- ([^:]+): .*?\+\d+\s+to\s+hit,\s*range\s+(\d+)(?:\/\d+)?/i);
    if (shorthandRangedMatch) {
      profiles.push({
        name: shorthandRangedMatch[1],
        attackKind: 'ranged',
        rangeFt: Number(shorthandRangedMatch[2]),
        raw: line
      });
      continue;
    }

    const shorthandMeleeMatch = line.match(/^- ([^:]+): .*?\+\d+\s+to\s+hit,\s*(?:reach\s+)?(\d+)\s*ft\b/i);
    if (shorthandMeleeMatch && !/\brange\b/i.test(line)) {
      profiles.push({
        name: shorthandMeleeMatch[1],
        attackKind: 'melee',
        rangeFt: Number(shorthandMeleeMatch[2]),
        raw: line
      });
    }
  }
  return profiles;
}

function bestEnemyDistance(state, token, cell, enemies) {
  if (!enemies.length) return Infinity;
  let best = Infinity;
  for (const enemy of enemies) {
    best = Math.min(best, minTokenDistanceCells(state, token, enemy, cell));
  }
  return best;
}

function buildMoveAttackSummary(state, token, cell, enemies, attackProfiles) {
  if (!attackProfiles.length || !enemies.length) {
    return {
      attackOpportunityCount: 0,
      attackTargets: [],
      bestAttackDistance: Infinity,
      attackTargetDistances: new Map()
    };
  }

  const attackTargetDistances = new Map();
  let attackOpportunityCount = 0;
  let bestAttackDistance = Infinity;

  for (const enemy of enemies) {
    for (const profile of attackProfiles) {
      const requiredCells = attackRangeCells(profile.rangeFt);
      const actualCells = minTokenDistanceCells(state, token, enemy, cell);
      if (actualCells > requiredCells) continue;
      attackOpportunityCount += 1;
      bestAttackDistance = Math.min(bestAttackDistance, actualCells);
      const currentBest = attackTargetDistances.get(enemy.name);
      if (currentBest == null || actualCells < currentBest) {
        attackTargetDistances.set(enemy.name, actualCells);
      }
    }
  }

  return {
    attackOpportunityCount,
    attackTargets: [...attackTargetDistances.keys()].sort(),
    bestAttackDistance,
    attackTargetDistances
  };
}

export function chooseMoveCandidates(state, token, enemies, limit = 10) {
  const start = gridCoordsFromToken(state, token);
  const attackProfiles = parseAttackProfiles(token?.statblock);
  const rankedMoves = legalMoveDestinations(state, token)
    .map((cell) => {
      const attackSummary = buildMoveAttackSummary(state, token, cell, enemies, attackProfiles);
      return {
        ...cell,
        fromStart: chebyshevDistanceCells(start, cell),
        nearestEnemyCells: bestEnemyDistance(state, token, cell, enemies),
        ...attackSummary
      };
    })
    .sort((left, right) => {
      const distanceDelta =
        bestEnemyDistance(state, token, left, enemies) -
        bestEnemyDistance(state, token, right, enemies);
      if (distanceDelta !== 0) return distanceDelta;
      const stepDelta = left.steps - right.steps;
      if (stepDelta !== 0) return stepDelta;
      const xDelta = left.x - right.x;
      if (xDelta !== 0) return xDelta;
      return left.y - right.y;
    })
    .filter((cell, index, cells) => index === cells.findIndex((entry) => entry.x === cell.x && entry.y === cell.y));

  const selectedMoves = [];
  const selectedKeys = new Set();
  const addMove = (move) => {
    const key = serializeCell(move);
    if (selectedKeys.has(key) || selectedMoves.length >= limit) return;
    selectedKeys.add(key);
    selectedMoves.push(move);
  };

  const attackTargetNames = [...new Set(rankedMoves.flatMap((move) => move.attackTargets))];
  for (const targetName of attackTargetNames) {
    const bestTargetMove = rankedMoves
      .filter((move) => move.attackTargetDistances.has(targetName))
      .sort((left, right) => {
        const targetDistanceDelta =
          left.attackTargetDistances.get(targetName) - right.attackTargetDistances.get(targetName);
        if (targetDistanceDelta !== 0) return targetDistanceDelta;
        const stepDelta = left.steps - right.steps;
        if (stepDelta !== 0) return stepDelta;
        const nearestEnemyDelta = left.nearestEnemyCells - right.nearestEnemyCells;
        if (nearestEnemyDelta !== 0) return nearestEnemyDelta;
        const xDelta = left.x - right.x;
        if (xDelta !== 0) return xDelta;
        return left.y - right.y;
      })[0];
    if (bestTargetMove) addMove(bestTargetMove);
    if (selectedMoves.length >= limit) break;
  }

  for (const move of rankedMoves) addMove(move);

  return selectedMoves.map((move) => ({
    ...move,
    attackTargetDistances: new Map(move.attackTargetDistances)
  }));
}

export function computeAttackOpportunities(state, token, moveCandidates, enemies, limit = 12) {
  const attackProfiles = parseAttackProfiles(token?.statblock);
  if (!attackProfiles.length || !enemies.length) return [];

  const opportunities = [];
  for (const move of moveCandidates) {
    for (const enemy of enemies) {
      for (const profile of attackProfiles) {
        const requiredCells = attackRangeCells(profile.rangeFt);
        const actualCells = minTokenDistanceCells(state, token, enemy, move);
        if (actualCells > requiredCells) continue;
        opportunities.push({
          attack: profile.name,
          attackKind: profile.attackKind,
          rangeFt: profile.rangeFt,
          target: enemy.name,
          from: { x: move.x, y: move.y },
          moveSteps: move.steps,
          distanceCells: actualCells
        });
      }
    }
  }

  opportunities.sort((left, right) => {
    const moveDelta = left.moveSteps - right.moveSteps;
    if (moveDelta !== 0) return moveDelta;
    const distanceDelta = left.distanceCells - right.distanceCells;
    if (distanceDelta !== 0) return distanceDelta;
    const attackDelta = left.attack.localeCompare(right.attack);
    if (attackDelta !== 0) return attackDelta;
    return left.target.localeCompare(right.target);
  });

  const deduped = [];
  const seen = new Set();
  for (const entry of opportunities) {
    const key = `${entry.attack}|${entry.target}|${entry.from.x},${entry.from.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function summarizeStatblock(statblockText, maxActions = 4) {
  const text = (statblockText || '').toString().trim();
  if (!text) return '(not provided)';
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const header = lines[0] || 'Current token';
  const ac = text.match(/\bAC\s+(\d+)/i)?.[1] || '?';
  const hp = text.match(/\bHP\s+(\d+)/i)?.[1] || '?';
  const speed = text.match(/\bSpeed\s+([^\n]+)/i)?.[1]?.split(',')[0]?.trim() || '?';
  const attacks = parseAttackProfiles(text).slice(0, maxActions);
  const parts = [`${header} | AC ${ac} | HP ${hp} | Speed ${speed}`];
  if (attacks.length) {
    parts.push(`Actions: ${attacks.map((entry) => `${entry.name}(${entry.attackKind}, ${entry.rangeFt}ft)`).join('; ')}`);
  }
  const traits = lines
    .filter((line) => line.startsWith('- ') && !/Melee |Ranged /i.test(line))
    .slice(0, 3)
    .map((line) => line.replace(/^- /, ''));
  if (traits.length) {
    parts.push(`Other: ${traits.join(' | ')}`);
  }
  return parts.join('\n');
}

function buildVerboseTokenLine(state, turnTok, token) {
  const cell = gridCoordsFromToken(state, token);
  return `- relation=${relationToTurnToken(turnTok, token)} ${token.type}: "${token.name}" at (${cell.x}, ${cell.y}), size ${token.sizeCells}x${token.sizeCells}, AC ${token.ac}, HP ${token.hp}, Speed ${token.speed} ft, max move ${maxMoveCellsForToken(token)} cells, Notes: ${token.notes || 'none'}`;
}

function buildCompactTokenLine(state, turnTok, token) {
  const cell = gridCoordsFromToken(state, token);
  const notes = token.notes ? `, notes=${token.notes}` : '';
  return `- ${relationToTurnToken(turnTok, token)} ${token.type} "${token.name}" @(${cell.x},${cell.y}) size=${token.sizeCells} AC=${token.ac} HP=${token.hp} spd=${token.speed} move=${maxMoveCellsForToken(token)}${notes}`;
}

function outputContractLines(compact = false) {
  if (compact) {
    return [
      'OUTPUT CONTRACT:',
      'Choose only from the legal move/action options listed below when possible.',
      'Return JSON only:',
      '{"summary":"...","moves":[{"token":"Name","to":[x,y],"path":[[x1,y1],[x2,y2]],"rationale":"..."}],"actions":[{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"...","rationale":"...","attack_kind":"melee|ranged|null","range_ft":5}],"end_turn":true}'
    ];
  }

  return [
    'OUTPUT CONTRACT:',
    'Return ONLY this JSON shape (no prose, no markdown):',
    '{',
    '  "summary": "brief overall rationale",',
    '  "moves": [{"token":"Name","to":[x,y],"path":[[x1,y1],[x2,y2]],"rationale":"brief movement reason"}],',
    '  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"...","rationale":"brief action reason","attack_kind":"melee|ranged|null","range_ft":5}],',
    'For a 5 ft melee attack, only return it when the attacker is adjacent to the target.',
    '  "end_turn": true',
    '}'
  ];
}

function appendLegalMoveAndAttackSections(lines, state, turnTok, options = {}) {
  const enemies = turnTok
    ? (state.tokens || []).filter((token) => token.id !== turnTok.id && !areFriendlyTokens(token, turnTok))
    : [];
  const moveCandidateLimit = Math.max(1, Number(options.moveCandidateLimit) || 10);
  const attackOpportunityLimit = Math.max(1, Number(options.attackOpportunityLimit) || 12);
  const moveCandidates = turnTok ? chooseMoveCandidates(state, turnTok, enemies, moveCandidateLimit) : [];
  const attackOpportunities = turnTok ? computeAttackOpportunities(state, turnTok, moveCandidates, enemies, attackOpportunityLimit) : [];

  lines.push('LEGAL MOVE CANDIDATES FOR CURRENT TURN TOKEN:');
  if (!moveCandidates.length) {
    lines.push('- none');
  } else {
    for (const move of moveCandidates) {
      lines.push(`- to=(${move.x},${move.y}) steps=${move.steps} nearest_enemy_cells=${move.nearestEnemyCells}`);
    }
  }
  lines.push('');
  lines.push('LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:');
  if (!attackOpportunities.length) {
    lines.push('- none from listed move candidates');
  } else {
    for (const option of attackOpportunities) {
      lines.push(`- attack="${option.attack}" kind=${option.attackKind} target="${option.target}" range_ft=${option.rangeFt} from=(${option.from.x},${option.from.y}) move_steps=${option.moveSteps} distance_cells=${option.distanceCells}`);
    }
  }
  lines.push('');
}

export function buildAiTurnPacketFromState(state) {
  return buildAiTurnPacketVerboseConstrainedFromState(state, {});
}

export function buildAiTurnPacketVerboseConstrainedFromState(state, options = {}) {
  const turnTok = getCurrentTurnToken(state);
  const lines = [];
  lines.push('SYSTEM: You are the tactical controller for the side specified below in a D&D 5e grid combat.');
  lines.push('You must follow the rules, use legal actions, and play competently.');
  lines.push('If information is missing, make conservative assumptions and state them briefly.');
  lines.push('');
  lines.push('RULES:');
  lines.push('- D&D 5e, grid-based. Each grid cell = 5 ft.');
  lines.push('- Maximum movement in cells = Speed / 5.');
  lines.push('- Positions are integer cells (x,y), 0-based; x increases right, y increases down.');
  lines.push('- For multi-cell tokens, (x,y) is the top-left occupied cell.');
  lines.push('- Diagonals cost 5 ft (default).');
  lines.push('- Only the current turn token may move or act this turn.');
  lines.push('- Token spaces cannot overlap, and a move must end in an unoccupied space.');
  lines.push('- Monsters are friendly to monsters. PCs and NPCs are friendly to each other.');
  lines.push('- Monsters are hostile to PCs and NPCs.');
  lines.push('- PCs and NPCs are hostile to Monsters.');
  lines.push('- Friendlies may pass through friendly spaces.');
  lines.push('- Opponents may not pass through opposing spaces.');
  lines.push("- Never return a move whose path length or destination exceeds the mover's legal movement in cells.");
  lines.push('- If a direct destination is blocked, choose a different legal destination instead of returning an illegal move.');
  lines.push('- No walls/cover unless specified; do not assume you can Hide unless cover/concealment exists.');
  lines.push('- Melee attacks with 5 ft reach require adjacency (touching occupied spaces). A target with one empty square between is 10 ft away and out of range.');
  lines.push('- Before returning any attack, check the actual grid distance from attacker space to target space.');
  lines.push("- Never return a melee attack unless the target is within the weapon's reach in feet.");
  lines.push('- If a melee target is out of reach, move closer, choose a different legal action, or attack a different legal target.');
  lines.push('- Keep the rationale honest to the final board state. Do not say a creature stayed out of melee, kept distance, or avoided adjacency if it ends adjacent to an enemy.');
  lines.push("- For attack actions, include attack_kind ('melee' or 'ranged') and range_ft. Use actual reach/range from the statblock.");
  lines.push('- Include a brief overall summary plus short rationale text for each move and action.');
  lines.push("- Write the summary as a flavorful DM-facing Narrator's Cue: 1-2 vivid sentences, concise, table-ready, and grounded in the actual move/action.");
  lines.push("- For every attack in the Narrator's Cue, always include a super-abbreviated mechanics stub with to-hit and damage in this style: '+4, 1d6+2 slashing' or 'DC 13 Dex, 2d6 fire'. Include both dice and fixed modifier when present.");
  lines.push('- Include a path array for each move when possible so the UI can show the planned route.');
  lines.push('');
  lines.push(`AI CONTROLS: ${state.aiControls}`);
  lines.push(`ROUND: ${state.round}`);
  lines.push(`TURN: ${turnTok ? `${turnTok.type} "${turnTok.name}"` : '(none)'}`);
  lines.push('');
  lines.push('MAP:');
  lines.push(`- Grid size px (visual): ${state.gridSize}`);
  lines.push(`- Map transform (for reference): offX=${Math.round(state.map.offX)}, offY=${Math.round(state.map.offY)}, scale=${state.map.scale.toFixed(2)}, rotDeg=${((state.map.rot * 180) / Math.PI).toFixed(2)}`);
  lines.push('- Blocked cells: []');
  lines.push('- Difficult terrain: []');
  lines.push('');
  lines.push('RELATIONSHIP MODEL:');
  lines.push(`- Current turn token: ${turnTok ? `"${turnTok.name}"` : '(none)'}`);
  lines.push('- relation=self means the current turn token.');
  lines.push('- relation=ally means same side as the current turn token.');
  lines.push('- relation=enemy means the opposing side.');
  lines.push('');
  lines.push('TOKENS:');
  if (!state.tokens.length) {
    lines.push('- (none)');
  } else {
    for (const token of state.tokens) lines.push(buildVerboseTokenLine(state, turnTok, token));
  }
  lines.push('');
  lines.push('OCCUPIED SPACES:');
  if (!state.tokens.length) {
    lines.push('- (none)');
  } else {
    for (const token of state.tokens) {
      const cell = gridCoordsFromToken(state, token);
      const occupied = cellsOccupiedAt(cell.x, cell.y, token.sizeCells).map((entry) => `(${entry.x},${entry.y})`).join(', ');
      lines.push(`- relation=${relationToTurnToken(turnTok, token)} "${token.name}" occupies: ${occupied}`);
    }
  }
  lines.push('');
  if (options.moveCandidateLimit || options.attackOpportunityLimit) {
    appendLegalMoveAndAttackSections(lines, state, turnTok, options);
  }
  lines.push('STATBLOCK (current turn token):');
  lines.push(turnTok?.statblock ? turnTok.statblock : '(not provided)');
  lines.push('');
  lines.push(...outputContractLines(false));
  return lines.join('\n');
}

export function buildAiTurnPacketCompactFromState(state, options = {}) {
  const turnTok = getCurrentTurnToken(state);
  const statblockMode = options.statblockMode === 'summary' ? 'summary' : 'full';

  const lines = [];
  lines.push('TACTICAL CONTROLLER: return one legal turn for the active side in D&D 5e grid combat.');
  lines.push('');
  lines.push('CORE RULES:');
  lines.push('- 1 cell = 5 ft. Only current turn token may move or act.');
  lines.push('- (x,y) are 0-based cell coords; multi-cell tokens use top-left occupied cell.');
  lines.push('- End movement in an unoccupied space; allies may be passed through, enemies may not.');
  lines.push('- Check actual reach/range before attacks. Never emit illegal melee attacks.');
  lines.push('- Keep summary and rationale consistent with the final board state.');
  lines.push("- In summary, always cite attack mechanics in compact form: '+to hit, XdY+Z type' or 'DC N save, XdY type'.");
  lines.push('');
  lines.push(`AI=${state.aiControls} ROUND=${state.round} TURN=${turnTok ? `${turnTok.type} "${turnTok.name}"` : '(none)'}`);
  lines.push(`MAP grid_px=${state.gridSize} transform=off(${Math.round(state.map.offX)},${Math.round(state.map.offY)}) scale=${state.map.scale.toFixed(2)} rotDeg=${((state.map.rot * 180) / Math.PI).toFixed(2)}`);
  lines.push('');
  lines.push('TOKENS:');
  if (!state.tokens.length) {
    lines.push('- (none)');
  } else {
    for (const token of state.tokens) lines.push(buildCompactTokenLine(state, turnTok, token));
  }
  lines.push('');
  appendLegalMoveAndAttackSections(lines, state, turnTok, options);
  lines.push('ACTIVE TOKEN STATBLOCK:');
  lines.push(
    statblockMode === 'summary'
      ? summarizeStatblock(turnTok?.statblock)
      : (turnTok?.statblock ? turnTok.statblock : '(not provided)')
  );
  lines.push('');
  lines.push(...outputContractLines(true));
  return lines.join('\n');
}

export function buildAiTurnPacketByVariant(state, variantId = 'compact_moves5') {
  switch (variantId) {
    case 'full':
      return buildAiTurnPacketFromState(state);
    case 'full_moves5_attacks6':
      return buildAiTurnPacketVerboseConstrainedFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 });
    case 'compact_base':
      return buildAiTurnPacketCompactFromState(state);
    case 'compact_moves5':
      return buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 });
    case 'compact_attacks6':
      return buildAiTurnPacketCompactFromState(state, { attackOpportunityLimit: 6 });
    case 'compact_summary':
      return buildAiTurnPacketCompactFromState(state, { statblockMode: 'summary' });
    case 'compact_moves5_attacks6':
      return buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 });
    case 'compact_moves5_summary':
      return buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, statblockMode: 'summary' });
    case 'compact_moves5_attacks6_summary':
      return buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' });
    default:
      return buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 });
  }
}

function buildGroupTacticalPacket(packet, state) {
  const groupTokens = getActiveAiGroupTokens(state);
  if (!groupTokens.length) return packet;

  const groupLines = [
    '',
    'ACTIVE TACTICAL GROUP:',
    `- Only these grouped monsters may move or act in this turn bundle: ${groupTokens.map((token) => `"${token.name}"`).join(', ')}`,
    '- Coordinate these monsters together and keep every move/action assigned to one of the grouped monsters.',
    ''
  ];

  const groupStatblocks = [
    'GROUP MEMBER STATBLOCKS:',
    ...groupTokens.flatMap((token) => [
      `- ${token.name}:`,
      token.statblock || '(not provided)'
    ])
  ];

  return packet
    .replace('- Only the current turn token may move or act this turn.', '- Only the current turn token may move or act this turn, unless ACTIVE TACTICAL GROUP rules below override this.')
    .replace(/(TURN: .*?\n)/, `$1${groupLines.join('\n')}`)
    .replace(/STATBLOCK \(current turn token\):/, `${groupStatblocks.join('\n')}\n\nSTATBLOCK (current turn token):`);
}

export function buildAiTurnPacketForStrategy(state, strategy = {}) {
  const packet = buildAiTurnPacketByVariant(state, strategy?.packetVariant || 'compact_moves5');
  if (strategy?.id === 'group_tactical') {
    return buildGroupTacticalPacket(packet, state);
  }
  return packet;
}
