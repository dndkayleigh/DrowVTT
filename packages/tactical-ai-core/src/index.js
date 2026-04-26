export const TACTICAL_CONTROLLER_KINDS = [
  'human',
  'scripted',
  'utility',
  'pure_llm',
  'hybrid',
  'per_monster_agents',
  'role_specialized',
  'squad_planner'
];

export const ACTIVATION_MODES = [
  'independent',
  'coordinated_sequential',
  'simultaneous_move_then_act',
  'fully_simultaneous'
];

export const TACTICAL_STANCES = [
  'aggressive',
  'cautious',
  'evasive',
  'protective',
  'desperate',
  'opportunistic'
];

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeCell(cell = {}) {
  return {
    x: Math.round(normalizeNumber(cell.x, 0)),
    y: Math.round(normalizeNumber(cell.y, 0))
  };
}

function normalizeActor(actor = {}) {
  return {
    id: String(actor.id || actor.name || ''),
    name: String(actor.name || actor.id || 'Actor'),
    side: actor.side === 'monsters' ? 'monsters' : actor.side === 'neutral' ? 'neutral' : 'heroes',
    kind: actor.kind || actor.type || 'unknown',
    cell: normalizeCell(actor.cell),
    sizeCells: Math.max(1, Math.round(normalizeNumber(actor.sizeCells, 1))),
    ac: Math.max(0, Math.round(normalizeNumber(actor.ac, 10))),
    hp: actor.hp == null ? '' : String(actor.hp),
    speed: Math.max(0, Math.round(normalizeNumber(actor.speed, 30))),
    attacks: Array.isArray(actor.attacks) ? actor.attacks.map(normalizeAttackProfile) : [],
    traits: uniqueStrings(actor.traits),
    tags: uniqueStrings(actor.tags),
    statblock: String(actor.statblock || ''),
    provenance: actor.provenance || {}
  };
}

function normalizeAttackProfile(attack = {}) {
  const attackKind = String(attack.attackKind || attack.kind || '').toLowerCase();
  return {
    name: String(attack.name || 'Attack'),
    attackKind: attackKind === 'ranged' ? 'ranged' : 'melee',
    rangeFt: Math.max(5, Math.round(normalizeNumber(attack.rangeFt, attackKind === 'ranged' ? 60 : 5))),
    expectedDamage: Math.max(0, normalizeNumber(attack.expectedDamage, 4)),
    tags: uniqueStrings(attack.tags)
  };
}

function normalizeBattlefieldEdge(edge = {}) {
  const orientation = String(edge.orientation || edge.o || '').toLowerCase().startsWith('v') ? 'v' : 'h';
  return {
    id: String(edge.id || `${orientation}:${Math.round(normalizeNumber(edge.x, 0))},${Math.round(normalizeNumber(edge.y, 0))}`),
    orientation,
    x: Math.round(normalizeNumber(edge.x, 0)),
    y: Math.round(normalizeNumber(edge.y, 0)),
    blocksMovement: edge.blocksMovement !== false,
    blocksLineOfSight: edge.blocksLineOfSight !== false,
    semantics: {
      climbable: !!edge.semantics?.climbable,
      jumpable: !!edge.semantics?.jumpable,
      oneWay: edge.semantics?.oneWay || null,
      breakable: !!edge.semantics?.breakable,
      door: !!edge.semantics?.door
    }
  };
}

function normalizeBattlefieldTile(tile = {}) {
  return {
    x: Math.round(normalizeNumber(tile.x, 0)),
    y: Math.round(normalizeNumber(tile.y, 0)),
    blocksMovement: !!tile.blocksMovement,
    difficult: !!tile.difficult,
    cover: tile.cover || 'none',
    elevation: normalizeNumber(tile.elevation, 0),
    hazards: uniqueStrings(tile.hazards),
    interactableIds: uniqueStrings(tile.interactableIds)
  };
}

export function normalizeEncounterState(encounter = {}) {
  const battlefield = encounter.battlefield || {};
  return {
    id: String(encounter.id || 'encounter'),
    round: Math.max(1, Math.round(normalizeNumber(encounter.round, 1))),
    activeActorId: encounter.activeActorId ? String(encounter.activeActorId) : null,
    activationGroups: Array.isArray(encounter.activationGroups) ? encounter.activationGroups : [],
    objectives: Array.isArray(encounter.objectives) ? encounter.objectives : [],
    actors: Array.isArray(encounter.actors) ? encounter.actors.map(normalizeActor).filter((actor) => actor.id) : [],
    battlefield: {
      gridSize: Math.max(1, Math.round(normalizeNumber(battlefield.gridSize, 64))),
      width: Math.max(0, Math.round(normalizeNumber(battlefield.width, 0))),
      height: Math.max(0, Math.round(normalizeNumber(battlefield.height, 0))),
      tiles: Array.isArray(battlefield.tiles) ? battlefield.tiles.map(normalizeBattlefieldTile) : [],
      edges: Array.isArray(battlefield.edges) ? battlefield.edges.map(normalizeBattlefieldEdge) : [],
      interactables: Array.isArray(battlefield.interactables) ? battlefield.interactables : []
    },
    metadata: encounter.metadata || {}
  };
}

export function validateEncounterState(encounter) {
  const normalized = normalizeEncounterState(encounter);
  const issues = [];
  if (!normalized.actors.length) issues.push('EncounterState requires at least one actor.');
  if (normalized.activeActorId && !normalized.actors.some((actor) => actor.id === normalized.activeActorId)) {
    issues.push(`activeActorId does not match an actor: ${normalized.activeActorId}`);
  }
  return { ok: issues.length === 0, issues, encounter: normalized };
}

export function createDecisionLogEntry({
  controllerId,
  actorId,
  phase = 'decision',
  message = '',
  data = {},
  level = 'info'
} = {}) {
  return {
    id: `${String(controllerId || 'controller')}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    controllerId: String(controllerId || ''),
    actorId: actorId ? String(actorId) : null,
    phase,
    level,
    message,
    data
  };
}

export function createReplayFrame({ encounter, controllerId, output, logs = [] } = {}) {
  return {
    id: `replay:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    controllerId: String(controllerId || ''),
    encounter: normalizeEncounterState(encounter),
    output,
    logs
  };
}

function edgeKey(edge) {
  const normalized = normalizeBattlefieldEdge(edge);
  return `${normalized.orientation}:${normalized.x},${normalized.y}`;
}

function blockingEdgeSet(encounter, los = false) {
  return new Set((encounter?.battlefield?.edges || [])
    .filter((edge) => los ? edge.blocksLineOfSight !== false : edge.blocksMovement !== false)
    .map(edgeKey));
}

export function gridDistance(a, b) {
  return Math.max(Math.abs(Number(a?.x) - Number(b?.x)), Math.abs(Number(a?.y) - Number(b?.y)));
}

export function pathCellsBetween(fromCell, toCell) {
  const steps = [];
  let x = Math.round(Number(fromCell?.x) || 0);
  let y = Math.round(Number(fromCell?.y) || 0);
  const target = normalizeCell(toCell);
  while (x !== target.x || y !== target.y) {
    if (x < target.x) x += 1;
    else if (x > target.x) x -= 1;
    if (y < target.y) y += 1;
    else if (y > target.y) y -= 1;
    steps.push({ x, y });
  }
  return steps;
}

export function movementEdgesBetweenCells(fromCell, toCell) {
  const fromX = Number(fromCell?.x);
  const fromY = Number(fromCell?.y);
  const toX = Number(toCell?.x);
  const toY = Number(toCell?.y);
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
  return [...new Set(edges)];
}

export function hasBlockedMovementPath(encounter, fromCell, toCell) {
  const blocked = blockingEdgeSet(encounter, false);
  if (!blocked.size) return false;
  let previous = normalizeCell(fromCell);
  for (const step of pathCellsBetween(previous, toCell)) {
    if (movementEdgesBetweenCells(previous, step).some((key) => blocked.has(key))) return true;
    previous = step;
  }
  return false;
}

function segmentIntersects(a, b, c, d) {
  const cross = (p, q, r) => ((q.y - p.y) * (r.x - q.x)) - ((q.x - p.x) * (r.y - q.y));
  const orientation = (p, q, r) => {
    const value = cross(p, q, r);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : 2;
  };
  const onSegment = (p, q, r) =>
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x + 1e-9 >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y + 1e-9 >= Math.min(p.y, r.y);
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  return o4 === 0 && onSegment(c, b, d);
}

export function actorAimPoint(actor, fromCell = null) {
  const cell = normalizeCell(fromCell || actor?.cell);
  const size = Math.max(1, Math.round(Number(actor?.sizeCells) || 1));
  return { x: cell.x + (size / 2), y: cell.y + (size / 2) };
}

export function hasLineOfSight(encounter, fromActor, toActor, fromCell = null) {
  const blocked = blockingEdgeSet(encounter, true);
  if (!blocked.size) return true;
  const start = actorAimPoint(fromActor, fromCell);
  const end = actorAimPoint(toActor);
  for (const edge of encounter?.battlefield?.edges || []) {
    if (!blocked.has(edgeKey(edge))) continue;
    const normalized = normalizeBattlefieldEdge(edge);
    const edgeStart = { x: normalized.x, y: normalized.y };
    const edgeEnd = normalized.orientation === 'v'
      ? { x: normalized.x, y: normalized.y + 1 }
      : { x: normalized.x + 1, y: normalized.y };
    if (segmentIntersects(start, end, edgeStart, edgeEnd)) return false;
  }
  return true;
}

function isCellInsideBattlefield(encounter, cell) {
  const normalized = normalizeCell(cell);
  const width = Math.round(Number(encounter?.battlefield?.width) || 0);
  const height = Math.round(Number(encounter?.battlefield?.height) || 0);
  if (normalized.x < 0 || normalized.y < 0) return false;
  if (width > 0 && normalized.x >= width) return false;
  if (height > 0 && normalized.y >= height) return false;
  return true;
}

function cellKey(cell) {
  const normalized = normalizeCell(cell);
  return `${normalized.x},${normalized.y}`;
}

function occupiedCellMap(encounter, { excludeActorId = null } = {}) {
  const occupied = new Map();
  for (const actor of encounter?.actors || []) {
    if (excludeActorId && actor.id === excludeActorId) continue;
    const origin = normalizeCell(actor.cell);
    const size = Math.max(1, Math.round(Number(actor.sizeCells) || 1));
    for (let dx = 0; dx < size; dx += 1) {
      for (let dy = 0; dy < size; dy += 1) {
        occupied.set(cellKey({ x: origin.x + dx, y: origin.y + dy }), actor);
      }
    }
  }
  return occupied;
}

function cellIsOccupied(encounter, cell, { excludeActorId = null } = {}) {
  return occupiedCellMap(encounter, { excludeActorId }).has(cellKey(cell));
}

function battlefieldSearchBounds(encounter) {
  const width = Math.round(Number(encounter?.battlefield?.width) || 0);
  const height = Math.round(Number(encounter?.battlefield?.height) || 0);
  if (width > 0 && height > 0) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  const actorCells = (encounter?.actors || []).map((actor) => normalizeCell(actor.cell));
  const maxActorX = Math.max(0, ...actorCells.map((cell) => cell.x));
  const maxActorY = Math.max(0, ...actorCells.map((cell) => cell.y));
  return { minX: 0, minY: 0, maxX: maxActorX + 12, maxY: maxActorY + 12 };
}

function neighborCells(encounter, cell, { actor = null, goal = null } = {}) {
  const current = normalizeCell(cell);
  const actorId = actor?.id || null;
  const movingSide = actor?.side || null;
  const directions = [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 },                    { x: 1, y: 0 },
    { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 }
  ];
  return directions
    .map((direction) => ({ x: current.x + direction.x, y: current.y + direction.y }))
    .filter((next) => isCellInsideBattlefield(encounter, next))
    .filter((next) => !hasBlockedMovementPath(encounter, current, next))
    .filter((next) => {
      const occupant = occupiedCellMap(encounter, { excludeActorId: actorId }).get(cellKey(next));
      if (!occupant) return true;
      if (goal && cellKey(next) === cellKey(goal)) return false;
      return movingSide && occupant.side === movingSide;
    });
}

export function findPath(encounterInput, fromCell, toCell, { maxExpanded = 3000, actor = null } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const start = normalizeCell(fromCell);
  const goal = normalizeCell(toCell);
  if (!isCellInsideBattlefield(encounter, start) || !isCellInsideBattlefield(encounter, goal)) return null;
  const movingActor = actor ? normalizeActor(actor) : null;
  if (cellIsOccupied(encounter, goal, { excludeActorId: movingActor?.id || null })) return null;
  if (cellKey(start) === cellKey(goal)) return [];
  const directPath = pathCellsBetween(start, goal);
  let previous = start;
  let directPathIsLegal = true;
  for (const step of directPath) {
    const occupant = occupiedCellMap(encounter, { excludeActorId: movingActor?.id || null }).get(cellKey(step));
    const occupiedByOpponent = occupant && (!movingActor?.side || occupant.side !== movingActor.side);
    const occupiedFinal = occupant && cellKey(step) === cellKey(goal);
    if (!isCellInsideBattlefield(encounter, step) || hasBlockedMovementPath(encounter, previous, step) || occupiedByOpponent || occupiedFinal) {
      directPathIsLegal = false;
      break;
    }
    previous = step;
  }
  if (directPathIsLegal) return directPath;
  const queue = [{ cell: start, cost: 0, priority: gridDistance(start, goal) }];
  const cameFrom = new Map([[cellKey(start), null]]);
  const costSoFar = new Map([[cellKey(start), 0]]);
  let expanded = 0;

  while (queue.length && expanded < maxExpanded) {
    queue.sort((left, right) => left.priority - right.priority || left.cost - right.cost);
    const current = queue.shift();
    expanded += 1;
    if (!current) break;
    if (cellKey(current.cell) === cellKey(goal)) {
      const path = [];
      let key = cellKey(goal);
      while (key !== cellKey(start)) {
        const cell = key.split(',').map(Number);
        path.push({ x: cell[0], y: cell[1] });
        key = cameFrom.get(key);
        if (!key) return null;
      }
      return path.reverse();
    }
    for (const next of neighborCells(encounter, current.cell, { actor: movingActor, goal })) {
      const nextKey = cellKey(next);
      const newCost = current.cost + 1;
      if (costSoFar.has(nextKey) && newCost >= costSoFar.get(nextKey)) continue;
      costSoFar.set(nextKey, newCost);
      cameFrom.set(nextKey, cellKey(current.cell));
      queue.push({ cell: next, cost: newCost, priority: newCost + gridDistance(next, goal) });
    }
  }

  return null;
}

export function findAttackPositions(encounterInput, actorInput, targetInput, attackInput, { limit = 80 } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput);
  const target = normalizeActor(targetInput);
  const attack = normalizeAttackProfile(attackInput);
  const bounds = battlefieldSearchBounds(encounter);
  const rangeCells = Math.max(1, Math.ceil(attack.rangeFt / 5));
  const positions = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const cell = { x, y };
      if (cellIsOccupied(encounter, cell, { excludeActorId: actor.id })) continue;
      if (gridDistance(cell, target.cell) > rangeCells) continue;
      if (!hasLineOfSight(encounter, actor, target, cell)) continue;
      positions.push({
        cell,
        targetId: target.id,
        attackName: attack.name,
        attackKind: attack.attackKind,
        rangeFt: attack.rangeFt,
        distanceToTarget: gridDistance(cell, target.cell)
      });
      if (positions.length >= limit) return positions;
    }
  }
  return positions;
}

export function rankApproachCells(encounterInput, actorInput, targetInput, attacksInput = [], { limit = 5 } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput);
  const target = normalizeActor(targetInput);
  const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
  const attacks = attacksInput.length ? attacksInput.map(normalizeAttackProfile) : [normalizeAttackProfile({ name: 'Strike', attackKind: 'melee', rangeFt: 5 })];
  const approaches = [];

  for (const attack of attacks) {
    for (const position of findAttackPositions(encounter, actor, target, attack, { limit: 120 })) {
      const path = findPath(encounter, actor.cell, position.cell, { actor });
      if (!path || path.length === 0) continue;
      const preferredAdvanceSteps = maxSteps >= 5
        ? Math.max(1, Math.floor(maxSteps * 0.67))
        : maxSteps;
      const movePath = path.slice(0, Math.min(path.length, preferredAdvanceSteps));
      while (movePath.length && cellIsOccupied(encounter, movePath[movePath.length - 1], { excludeActorId: actor.id })) {
        movePath.pop();
      }
      const destination = movePath[movePath.length - 1];
      if (!destination) continue;
      approaches.push({
        cell: destination,
        path: movePath,
        futureAttackCell: position.cell,
        futureAttackDistance: path.length,
        remainingDistance: Math.max(0, path.length - movePath.length),
        movementUsed: movePath.length,
        reserveCells: Math.max(0, maxSteps - movePath.length),
        laneDeviation: Math.abs(position.cell.y - actor.cell.y),
        attackName: attack.name,
        attackKind: attack.attackKind,
        rangeFt: attack.rangeFt,
        expectedDamage: attack.expectedDamage,
        targetId: target.id
      });
    }
  }

  const bestByCell = new Map();
  for (const approach of approaches) {
    const key = cellKey(approach.cell);
    const existing = bestByCell.get(key);
    if (!existing || approach.futureAttackDistance < existing.futureAttackDistance || approach.expectedDamage > existing.expectedDamage) {
      bestByCell.set(key, approach);
    }
  }

  return [...bestByCell.values()]
    .sort((left, right) =>
      left.remainingDistance - right.remainingDistance ||
      right.reserveCells - left.reserveCells ||
      left.laneDeviation - right.laneDeviation ||
      right.expectedDamage - left.expectedDamage ||
      left.futureAttackDistance - right.futureAttackDistance
    )
    .slice(0, limit);
}

export class SimpleGridRulesAdapter {
  reachableTiles(encounterInput, actor, { limit = 24 } = {}) {
    const encounter = normalizeEncounterState(encounterInput);
    const start = normalizeCell(actor?.cell);
    const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
    const queue = [{ cell: start, steps: 0, path: [] }];
    const visited = new Set([`${start.x},${start.y}`]);
    const reachable = [{ ...start, steps: 0, path: [] }];
    const directions = [
      { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
      { x: -1, y: 0 },                    { x: 1, y: 0 },
      { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 }
    ];
    while (queue.length && reachable.length < limit) {
      const current = queue.shift();
      if (!current || current.steps >= maxSteps) continue;
      for (const direction of directions) {
        const next = { x: current.cell.x + direction.x, y: current.cell.y + direction.y };
        const key = `${next.x},${next.y}`;
        if (visited.has(key)) continue;
        if (!isCellInsideBattlefield(encounter, next)) continue;
        if (hasBlockedMovementPath(encounter, current.cell, next)) continue;
        const occupant = occupiedCellMap(encounter, { excludeActorId: actor?.id || null }).get(cellKey(next));
        if (occupant && occupant.side !== actor?.side) continue;
        visited.add(key);
        const entry = { ...next, steps: current.steps + 1, path: [...(current.path || []), normalizeCell(next)], occupied: !!occupant };
        if (!occupant) reachable.push(entry);
        queue.push({ cell: next, steps: entry.steps, path: entry.path });
        if (reachable.length >= limit) break;
      }
    }
    return reachable;
  }

  legalActions(encounterInput, actor, { candidateLimit = 24 } = {}) {
    return generateCandidateActions(encounterInput, actor, { rulesAdapter: this, limit: candidateLimit });
  }

  lineOfSight(encounterInput, fromActor, toActor, fromCell = null) {
    return hasLineOfSight(normalizeEncounterState(encounterInput), fromActor, toActor, fromCell);
  }

  cover() {
    return 'none';
  }

  opportunityRisk(encounterInput, actor, cell) {
    const encounter = normalizeEncounterState(encounterInput);
    return encounter.actors
      .filter((other) => other.id !== actor.id && other.side !== actor.side)
      .some((enemy) => gridDistance(enemy.cell, cell) <= 1) ? 1 : 0;
  }

  interactableLegality() {
    return { ok: true, reason: '' };
  }
}

export class FiveELikeRulesAdapter extends SimpleGridRulesAdapter {}

function enemiesFor(encounter, actor) {
  return encounter.actors.filter((other) => other.id !== actor.id && other.side !== actor.side && other.side !== 'neutral');
}

function alliesFor(encounter, actor) {
  return encounter.actors.filter((other) => other.id !== actor.id && other.side === actor.side);
}

function attackAction(actor, target, attack, fromCell, family, moveSteps = 0, metadata = {}) {
  const movePath = metadata.path?.length ? metadata.path.map(normalizeCell) : pathCellsBetween(actor.cell, fromCell);
  const move = gridDistance(actor.cell, fromCell) > 0
    ? { actorId: actor.id, to: normalizeCell(fromCell), path: movePath }
    : null;
  return {
    id: `${family}:${actor.id}:${target.id}:${attack.name}:${fromCell.x},${fromCell.y}`,
    family,
    actorId: actor.id,
    label: `${actor.name} ${attack.name} vs ${target.name}`,
    move,
    action: {
      type: 'attack',
      actorId: actor.id,
      targetId: target.id,
      details: attack.name,
      attackKind: attack.attackKind,
      rangeFt: attack.rangeFt
    },
    targetIds: [target.id],
    fromCell: normalizeCell(fromCell),
    expectedDamage: attack.expectedDamage,
    moveSteps,
    legal: true,
    metadata
  };
}

function advanceAction(actor, target, toCell, moveSteps = 0, metadata = {}) {
  const path = metadata.path?.length ? metadata.path.map(normalizeCell) : pathCellsBetween(actor.cell, toCell);
  return {
    id: `advance_to_attack:${actor.id}:${target.id}:${toCell.x},${toCell.y}`,
    family: 'advance_to_attack',
    actorId: actor.id,
    label: `${actor.name} advances toward ${target.name}`,
    move: { actorId: actor.id, to: normalizeCell(toCell), path },
    action: { type: 'dash', actorId: actor.id },
    targetIds: [target.id],
    fromCell: normalizeCell(toCell),
    expectedDamage: 0,
    moveSteps,
    legal: true,
    metadata
  };
}

export function generateCandidateActions(encounterInput, actorInput, { rulesAdapter = new SimpleGridRulesAdapter(), limit = 24 } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput || encounter.actors.find((entry) => entry.id === encounter.activeActorId));
  if (!actor?.id) return [];
  const enemies = enemiesFor(encounter, actor);
  const candidates = [];
  const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
  const movementEnvelopeLimit = Math.max(1, (maxSteps * 2 + 1) ** 2);
  const reachable = rulesAdapter.reachableTiles(encounter, actor, { limit: Math.max(limit * 3, movementEnvelopeLimit) });
  const attacks = actor.attacks.length ? actor.attacks : [normalizeAttackProfile({ name: 'Strike', attackKind: 'melee', rangeFt: 5 })];

  for (const enemy of enemies) {
    for (const attack of attacks) {
      const rangeCells = Math.max(1, Math.ceil(attack.rangeFt / 5));
      if (gridDistance(actor.cell, enemy.cell) <= rangeCells && rulesAdapter.lineOfSight(encounter, actor, enemy, actor.cell)) {
        candidates.push(attackAction(actor, enemy, attack, actor.cell, 'attack_from_current', 0));
      }
      const moveAttackCells = reachable
        .filter((cell) => gridDistance(cell, actor.cell) > 0)
        .filter((cell) => gridDistance(cell, enemy.cell) <= rangeCells)
        .filter((cell) => rulesAdapter.lineOfSight(encounter, actor, enemy, cell))
        .sort((left, right) =>
          (left.steps || 0) - (right.steps || 0) ||
          gridDistance(left, enemy.cell) - gridDistance(right, enemy.cell)
        )
        .slice(0, 6);
      for (const cell of moveAttackCells) {
        candidates.push(attackAction(actor, enemy, attack, cell, 'move_and_attack', cell.steps, {
          path: cell.path || pathCellsBetween(actor.cell, cell)
        }));
      }
    }
  }

  const nearestEnemy = enemies
    .map((enemy) => ({ enemy, distance: gridDistance(actor.cell, enemy.cell) }))
    .sort((left, right) => left.distance - right.distance)[0]?.enemy;
  if (nearestEnemy) {
    const approach = rankApproachCells(encounter, actor, nearestEnemy, attacks, { limit: 1 })[0];
    if (approach && gridDistance(approach.cell, actor.cell) > 0) {
      candidates.push(advanceAction(actor, nearestEnemy, approach.cell, approach.path.length, {
        path: approach.path,
        futureAttackCell: approach.futureAttackCell,
        futureAttackDistance: approach.futureAttackDistance,
        remainingDistance: approach.remainingDistance,
        movementUsed: approach.movementUsed,
        reserveCells: approach.reserveCells,
        laneDeviation: approach.laneDeviation,
        attackName: approach.attackName,
        attackKind: approach.attackKind,
        targetId: approach.targetId
      }));
    }

    const retreat = reachable
      .slice()
      .sort((left, right) => gridDistance(right, nearestEnemy.cell) - gridDistance(left, nearestEnemy.cell))[0];
    if (retreat && gridDistance(retreat, actor.cell) > 0) {
      candidates.push({
        id: `disengage_retreat:${actor.id}:${retreat.x},${retreat.y}`,
        family: 'disengage_retreat',
        actorId: actor.id,
        label: `${actor.name} retreats`,
        move: { actorId: actor.id, to: normalizeCell(retreat), path: pathCellsBetween(actor.cell, retreat) },
        action: { type: 'disengage', actorId: actor.id },
        targetIds: [],
        fromCell: normalizeCell(retreat),
        expectedDamage: 0,
        moveSteps: retreat.steps,
        legal: true
      });
    }
  }

  candidates.push({
    id: `hold_position:${actor.id}`,
    family: 'hold_position',
    actorId: actor.id,
    label: `${actor.name} holds position`,
    move: null,
    action: { type: 'dodge', actorId: actor.id },
    targetIds: [],
    fromCell: normalizeCell(actor.cell),
    expectedDamage: 0,
    moveSteps: 0,
    legal: true
  });

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).slice(0, limit);
}

export function extractScoringFeatures(encounterInput, candidate) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = encounter.actors.find((entry) => entry.id === candidate.actorId);
  const target = encounter.actors.find((entry) => candidate.targetIds?.includes(entry.id));
  const allies = actor ? alliesFor(encounter, actor) : [];
  const nearestEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(candidate.fromCell || actor.cell, enemy.cell)), Infinity)
    : Infinity;
  return {
    expectedDamage: normalizeNumber(candidate.expectedDamage, 0),
    attackValue: candidate.action?.type === 'attack' ? 1 : 0,
    rangedAttackValue: candidate.action?.type === 'attack' && candidate.action?.attackKind === 'ranged' ? 1 : 0,
    currentPositionValue: candidate.family === 'attack_from_current' ? 1 : 0,
    repositionValue: candidate.family === 'move_and_attack' || candidate.family === 'advance_to_attack' ? 1 : 0,
    killChance: target && String(target.hp).match(/^\d+/)
      ? Math.min(1, normalizeNumber(candidate.expectedDamage, 0) / Math.max(1, Number(String(target.hp).match(/^\d+/)?.[0])))
      : 0,
    retaliationRisk: Number.isFinite(nearestEnemyDistance) && nearestEnemyDistance <= 1 ? 1 : 0,
    defensiveValue: candidate.family === 'disengage_retreat' || candidate.action?.type === 'dodge' ? 1 : 0,
    coverGain: 0,
    objectiveProgress: candidate.family === 'objective_reposition' ? 1 : 0,
    allySupport: allies.some((ally) => gridDistance(candidate.fromCell || actor?.cell || {}, ally.cell) <= 1) ? 1 : 0,
    terrainAdvantage: 0,
    chokeControl: candidate.family === 'move_to_chokepoint' ? 1 : 0,
    interactableUtility: candidate.family === 'use_interactable' ? 1 : 0,
    formationValue: allies.length ? 0.25 : 0,
    overkillPenalty: 0,
    holdPenalty: candidate.family === 'hold_position' ? 1 : 0,
    retreatPenalty: candidate.family === 'disengage_retreat' ? 1 : 0
  };
}

export function scoreCandidate(encounter, candidate, { stance = 'opportunistic' } = {}) {
  const weightsByStance = {
    aggressive: { expectedDamage: 2.2, attackValue: 4, rangedAttackValue: 0.4, currentPositionValue: 0.8, repositionValue: 0.4, killChance: 1.5, retaliationRisk: -0.4, holdPenalty: -3, retreatPenalty: -2 },
    cautious: { expectedDamage: 1.2, attackValue: 3, rangedAttackValue: 0.8, currentPositionValue: 0.8, repositionValue: 0.3, defensiveValue: 0.8, retaliationRisk: -1.4, holdPenalty: -2, retreatPenalty: -1.2 },
    evasive: { expectedDamage: 0.7, attackValue: 2, rangedAttackValue: 0.8, defensiveValue: 1.2, retaliationRisk: -2, holdPenalty: -1.5, retreatPenalty: -0.4 },
    protective: { expectedDamage: 1, attackValue: 3, rangedAttackValue: 0.4, currentPositionValue: 0.6, allySupport: 1.8, formationValue: 1.2, holdPenalty: -2, retreatPenalty: -1 },
    desperate: { expectedDamage: 2.4, attackValue: 5, currentPositionValue: 0.8, killChance: 2, retaliationRisk: -0.1, holdPenalty: -4, retreatPenalty: -3 },
    opportunistic: { expectedDamage: 1.6, attackValue: 4, rangedAttackValue: 0.6, currentPositionValue: 0.8, repositionValue: 0.4, killChance: 1.2, defensiveValue: 0.2, retaliationRisk: -0.8, holdPenalty: -2.5, retreatPenalty: -1.5 }
  };
  const features = extractScoringFeatures(encounter, candidate);
  const weights = weightsByStance[stance] || weightsByStance.opportunistic;
  const score = Object.entries(features).reduce((sum, [key, value]) => sum + (weights[key] || 0) * value, 0);
  return { score, features, stance };
}

function summarizeCandidate(candidate, scored = null) {
  return {
    id: candidate.id,
    family: candidate.family,
    label: candidate.label,
    actionType: candidate.action?.type || null,
    attackKind: candidate.action?.attackKind || null,
    targetIds: candidate.targetIds || [],
    moveSteps: candidate.moveSteps || 0,
    expectedDamage: normalizeNumber(candidate.expectedDamage, 0),
    futureAttackCell: candidate.metadata?.futureAttackCell || null,
    futureAttackDistance: candidate.metadata?.futureAttackDistance ?? null,
    remainingDistance: candidate.metadata?.remainingDistance ?? null,
    movementUsed: candidate.metadata?.movementUsed ?? null,
    reserveCells: candidate.metadata?.reserveCells ?? null,
    laneDeviation: candidate.metadata?.laneDeviation ?? null,
    approachAttack: candidate.metadata?.attackName || null,
    score: scored?.score ?? null,
    features: scored?.features || null
  };
}

function topCandidateSummaries(encounter, candidates, { stance = 'opportunistic', limit = 5 } = {}) {
  return candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(encounter, candidate, { stance }) }))
    .sort((left, right) => right.score - left.score || left.candidate.moveSteps - right.candidate.moveSteps)
    .slice(0, limit)
    .map((entry) => summarizeCandidate(entry.candidate, entry));
}

function candidateFamilyCounts(candidates = []) {
  return candidates.reduce((counts, candidate) => {
    counts[candidate.family] = (counts[candidate.family] || 0) + 1;
    return counts;
  }, {});
}

function decisionSummary({ controllerLabel, selected, candidates, topCandidates = [] }) {
  if (!selected) return `${controllerLabel} found no legal candidates.`;
  const counts = candidateFamilyCounts(candidates);
  const attackCount = (counts.attack_from_current || 0) + (counts.move_and_attack || 0);
  const topLine = topCandidates
    .slice(0, 3)
    .map((candidate) => `${candidate.family}${candidate.score == null ? '' : `=${candidate.score.toFixed(2)}`}`)
    .join(', ');
  return `${controllerLabel} selected ${selected.family} from ${candidates.length} candidates (${attackCount} attacks, ${counts.advance_to_attack || 0} advances, ${counts.disengage_retreat || 0} retreats, ${counts.hold_position || 0} holds). Top candidates: ${topLine || 'none'}.`;
}

function outputFromCandidate({ encounter, controllerId, candidate, candidates = [], logs = [], stance = 'opportunistic' }) {
  const actor = encounter.actors.find((entry) => entry.id === candidate?.actorId);
  if (!candidate || !actor) {
    return {
      controllerId,
      actorId: actor?.id || encounter.activeActorId || null,
      plan: { moves: [], actions: [], endTurn: true },
      selectedCandidateId: null,
      candidates,
      explanation: { summary: 'No legal action available.', features: {}, stance },
      logs
    };
  }
  const action = candidate.action?.type === 'attack'
    ? {
        token: actor.name,
        type: 'attack',
        target: encounter.actors.find((entry) => entry.id === candidate.action.targetId)?.name || null,
        details: candidate.action.details,
        rationale: candidate.label,
        attack_kind: candidate.action.attackKind,
        range_ft: candidate.action.rangeFt
      }
    : {
        token: actor.name,
        type: candidate.action?.type || 'other',
        target: null,
        details: candidate.label,
        rationale: candidate.label,
        attack_kind: null,
        range_ft: null
      };
  return {
    controllerId,
    actorId: actor.id,
    plan: {
      moves: candidate.move ? [{ token: actor.name, to: [candidate.move.to.x, candidate.move.to.y], path: candidate.move.path.map((cell) => [cell.x, cell.y]), rationale: candidate.label }] : [],
      actions: [action],
      endTurn: true
    },
    selectedCandidateId: candidate.id,
    candidates,
    explanation: {
      summary: `${candidate.label}.`,
      features: scoreCandidate(encounter, candidate, { stance }).features,
      stance
    },
    logs
  };
}

export class HumanController {
  id = 'human';
  label = 'Human Controller';
  kind = 'human';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const candidates = generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 });
    const selected = input.selectedAction || candidates.find((candidate) => candidate.id === input.selectedCandidateId) || null;
    const logs = [createDecisionLogEntry({ controllerId: this.id, actorId: actor?.id, message: selected ? 'Human selected action.' : 'Human action pending.' })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs });
  }
}

export class ScriptedController {
  id = 'scripted_baseline';
  label = 'Scripted Baseline';
  kind = 'scripted';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const candidates = generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 });
    const bestAttack = (family) => candidates
      .filter((candidate) => candidate.family === family)
      .sort((left, right) =>
        normalizeNumber(right.expectedDamage, 0) - normalizeNumber(left.expectedDamage, 0) ||
        (left.moveSteps || 0) - (right.moveSteps || 0) ||
        (right.action?.attackKind === 'ranged' ? 1 : 0) - (left.action?.attackKind === 'ranged' ? 1 : 0)
      )[0];
    const selected = bestAttack('attack_from_current')
      || bestAttack('move_and_attack')
      || candidates.find((candidate) => candidate.family === 'advance_to_attack')
      || candidates.find((candidate) => candidate.family === 'disengage_retreat')
      || candidates[0];
    const topCandidates = topCandidateSummaries(encounter, candidates, { limit: 5 });
    const logs = [createDecisionLogEntry({
      controllerId: this.id,
      actorId: actor?.id,
      message: decisionSummary({ controllerLabel: this.label, selected, candidates, topCandidates }),
      data: {
        ruleOrder: ['best attack from current position', 'best move and attack', 'advance toward attack range', 'retreat only if no advance is possible', 'fallback'],
        familyCounts: candidateFamilyCounts(candidates),
        selected: selected ? summarizeCandidate(selected) : null,
        topCandidates
      }
    })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs });
  }
}

export class UtilityController {
  id = 'utility_baseline';
  label = 'Utility Baseline';
  kind = 'utility';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const stance = TACTICAL_STANCES.includes(input.stance) ? input.stance : 'opportunistic';
    const candidates = generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 });
    const scored = candidates.map((candidate) => ({ candidate, ...scoreCandidate(encounter, candidate, { stance }) }));
    scored.sort((left, right) => right.score - left.score || left.candidate.moveSteps - right.candidate.moveSteps);
    const selected = scored[0]?.candidate || candidates[0];
    const topCandidates = scored.slice(0, 5).map((entry) => summarizeCandidate(entry.candidate, entry));
    const logs = [createDecisionLogEntry({
      controllerId: this.id,
      actorId: actor?.id,
      message: decisionSummary({ controllerLabel: this.label, selected, candidates, topCandidates }),
      data: {
        stance,
        familyCounts: candidateFamilyCounts(candidates),
        selected: selected ? summarizeCandidate(selected, scored.find((entry) => entry.candidate.id === selected.id)) : null,
        topCandidates
      }
    })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs, stance });
  }
}

export class PureLLMController {
  id = 'pure_llm_stub';
  label = 'Pure LLM Controller';
  kind = 'pure_llm';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;
  async chooseAction() {
    throw new Error('PureLLMController requires an advisor provider in a later phase.');
  }
}

export class HybridController extends UtilityController {
  id = 'hybrid_stub';
  label = 'Hybrid Controller';
  kind = 'hybrid';
}

export class PerMonsterAgentController extends UtilityController {
  id = 'per_monster_agents_stub';
  label = 'Per-Monster Agents';
  kind = 'per_monster_agents';
}

export class RoleSpecializedPlannerController extends UtilityController {
  id = 'role_specialized_stub';
  label = 'Role-Specialized Planner';
  kind = 'role_specialized';
}

export class SquadPlannerController extends UtilityController {
  id = 'squad_planner_stub';
  label = 'Centralized Squad Planner';
  kind = 'squad_planner';
  supportsGroupPlanning = true;
  async chooseGroupAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const group = input.activationGroup || { actorIds: [encounter.activeActorId].filter(Boolean), activationMode: 'coordinated_sequential' };
    const outputs = [];
    for (const actorId of group.actorIds || []) {
      outputs.push(await this.chooseAction({ ...input, encounter, actorId }));
    }
    return {
      controllerId: this.id,
      activationGroup: group,
      plans: outputs.map((output) => output.plan),
      logs: outputs.flatMap((output) => output.logs || [])
    };
  }
}

export function createControllerRegistry() {
  const controllers = [
    new HumanController(),
    new ScriptedController(),
    new UtilityController(),
    new PureLLMController(),
    new HybridController(),
    new PerMonsterAgentController(),
    new RoleSpecializedPlannerController(),
    new SquadPlannerController()
  ];
  return new Map(controllers.map((controller) => [controller.id, controller]));
}

export function getController(controllerId, registry = createControllerRegistry()) {
  return registry.get(controllerId) || registry.get('utility_baseline');
}

export function tacticalOutputToVttPlan(output = {}) {
  return {
    summary: output.explanation?.summary || '',
    moves: output.plan?.moves || [],
    actions: output.plan?.actions || [],
    end_turn: output.plan?.endTurn !== false,
    _controller: {
      id: output.controllerId,
      selectedCandidateId: output.selectedCandidateId,
      logs: output.logs || [],
      explanation: output.explanation || null
    }
  };
}
